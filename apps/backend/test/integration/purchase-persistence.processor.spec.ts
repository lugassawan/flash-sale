import { DataSource, Repository } from 'typeorm';
import {
  setupPostgresContainer,
  teardownPostgresContainer,
  cleanDatabase,
} from './setup/pg-test-containers.setup';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { PgPurchaseRepository } from '@/infrastructure/persistence/postgresql/repositories/pg-purchase.repository';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
} from '@/infrastructure/persistence/postgresql/circuit-breaker';

describe('PurchasePersistenceProcessor (Integration)', () => {
  let dataSource: DataSource;
  let purchaseOrmRepo: Repository<PurchaseOrmEntity>;
  let productOrmRepo: Repository<ProductOrmEntity>;
  let pgPurchaseRepo: PgPurchaseRepository;
  let circuitBreaker: CircuitBreaker;
  let testProduct: ProductOrmEntity;

  beforeAll(async () => {
    const setup = await setupPostgresContainer();
    dataSource = setup.dataSource;
    productOrmRepo = dataSource.getRepository(ProductOrmEntity);
    purchaseOrmRepo = dataSource.getRepository(PurchaseOrmEntity);
    pgPurchaseRepo = new PgPurchaseRepository(purchaseOrmRepo, productOrmRepo);
  }, 60_000);

  afterAll(async () => {
    await teardownPostgresContainer();
  }, 30_000);

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    circuitBreaker = new CircuitBreaker(5, 30_000);
    testProduct = await productOrmRepo.save({
      sku: 'PROC-SKU-001',
      productName: 'Processor Test Product',
      initialStock: 50,
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-12-31T23:59:59Z'),
      state: 'ACTIVE',
      createdBy: 'test',
    });
  });

  it('should persist purchase through circuit breaker when CLOSED', async () => {
    const { Purchase } = await import('@/core/domain/purchase/entities/purchase.entity');
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-PROC-0001',
      sku: 'PROC-SKU-001',
      userId: 'user-proc-1',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
    });

    await circuitBreaker.run(async () => {
      await pgPurchaseRepo.persist(purchase);
    });

    const saved = await purchaseOrmRepo.findOne({
      where: { productId: testProduct.id, userId: 'user-proc-1' },
    });
    expect(saved).not.toBeNull();
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open circuit breaker after 5 failures', async () => {
    const failingOp = async () => {
      throw new Error('PG connection failed');
    };

    for (let i = 0; i < 5; i++) {
      await expect(circuitBreaker.run(failingOp)).rejects.toThrow('PG connection failed');
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

    await expect(circuitBreaker.run(async () => 'test')).rejects.toThrow(CircuitOpenError);
  });

  it('should transition from OPEN to HALF_OPEN after recovery time', async () => {
    const shortRecoveryBreaker = new CircuitBreaker(2, 100);

    for (let i = 0; i < 2; i++) {
      await expect(
        shortRecoveryBreaker.run(async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow();
    }

    expect(shortRecoveryBreaker.getState()).toBe(CircuitState.OPEN);

    await new Promise((resolve) => setTimeout(resolve, 150));

    await shortRecoveryBreaker.run(async () => 'recovered');
    expect(shortRecoveryBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should handle idempotent persistence through circuit breaker', async () => {
    const { Purchase } = await import('@/core/domain/purchase/entities/purchase.entity');
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-PROC-IDEM',
      sku: 'PROC-SKU-001',
      userId: 'user-idem',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
    });

    await circuitBreaker.run(() => pgPurchaseRepo.persist(purchase));
    await circuitBreaker.run(() => pgPurchaseRepo.persist(purchase));

    const count = await purchaseOrmRepo.count({
      where: { productId: testProduct.id, userId: 'user-idem' },
    });
    expect(count).toBe(1);
  });
});
