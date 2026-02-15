import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import {
  setupPostgresContainer,
  teardownPostgresContainer,
  cleanDatabase,
} from './setup/pg-test-containers.setup';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { ReconciliationService } from '@/infrastructure/scheduling/reconciliation.service';
import { PurchaseJobData } from '@/application/ports/purchase-persistence.port';

describe('ReconciliationService (Integration)', () => {
  let dataSource: DataSource;
  let redis: Redis;
  let productOrmRepo: Repository<ProductOrmEntity>;
  let purchaseOrmRepo: Repository<PurchaseOrmEntity>;
  let reconciliationService: ReconciliationService;
  let enqueuedJobs: PurchaseJobData[];
  let testProduct: ProductOrmEntity;

  beforeAll(async () => {
    const pgSetup = await setupPostgresContainer();
    dataSource = pgSetup.dataSource;

    const redisSetup = await setupRedisContainer();
    redis = redisSetup.client;

    productOrmRepo = dataSource.getRepository(ProductOrmEntity);
    purchaseOrmRepo = dataSource.getRepository(PurchaseOrmEntity);
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
    await teardownPostgresContainer();
  }, 30_000);

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    await redis.flushdb();
    enqueuedJobs = [];

    const mockPersistence = {
      enqueue: async (job: PurchaseJobData) => {
        enqueuedJobs.push(job);
      },
    };

    reconciliationService = new ReconciliationService(
      redis,
      purchaseOrmRepo,
      productOrmRepo,
      mockPersistence,
    );

    testProduct = await productOrmRepo.save({
      sku: 'RECON-SKU-001',
      productName: 'Reconciliation Test Product',
      initialStock: 100,
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-12-31T23:59:59Z'),
      state: 'ACTIVE',
      createdBy: 'test',
    });
  });

  it('should detect no mismatches when Redis and PG are in sync', async () => {
    await redis.sadd('sale:RECON-SKU-001:buyers', 'user-1', 'user-2');

    await purchaseOrmRepo.save([
      {
        productId: testProduct.id,
        userId: 'user-1',
        purchasedAt: new Date(),
        createdBy: 'system',
      },
      {
        productId: testProduct.id,
        userId: 'user-2',
        purchasedAt: new Date(),
        createdBy: 'system',
      },
    ]);

    const result = await reconciliationService.reconcile('RECON-SKU-001');

    expect(result.mismatches).toBe(0);
    expect(enqueuedJobs).toHaveLength(0);
  });

  it('should detect mismatches and re-enqueue missing purchases', async () => {
    await redis.sadd('sale:RECON-SKU-001:buyers', 'user-1', 'user-2', 'user-3');

    await purchaseOrmRepo.save({
      productId: testProduct.id,
      userId: 'user-1',
      purchasedAt: new Date(),
      createdBy: 'system',
    });

    const result = await reconciliationService.reconcile('RECON-SKU-001');

    expect(result.mismatches).toBe(2);
    expect(enqueuedJobs).toHaveLength(2);

    const enqueuedUserIds = enqueuedJobs.map((j) => j.userId).sort();
    expect(enqueuedUserIds).toEqual(['user-2', 'user-3']);
    expect(enqueuedJobs[0].sku).toBe('RECON-SKU-001');
  });

  it('should return 0 mismatches when no buyers in Redis', async () => {
    const result = await reconciliationService.reconcile('RECON-SKU-001');

    expect(result.mismatches).toBe(0);
    expect(enqueuedJobs).toHaveLength(0);
  });

  it('should return 0 mismatches when product not found', async () => {
    await redis.sadd('sale:NONEXISTENT:buyers', 'user-1');

    const result = await reconciliationService.reconcile('NONEXISTENT');

    expect(result.mismatches).toBe(0);
    expect(enqueuedJobs).toHaveLength(0);
  });

  it('should re-enqueue all buyers when PG has no purchases', async () => {
    await redis.sadd('sale:RECON-SKU-001:buyers', 'user-a', 'user-b');

    const result = await reconciliationService.reconcile('RECON-SKU-001');

    expect(result.mismatches).toBe(2);
    expect(enqueuedJobs).toHaveLength(2);
  });
});
