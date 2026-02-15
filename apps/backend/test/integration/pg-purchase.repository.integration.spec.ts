import { DataSource, Repository } from 'typeorm';
import {
  setupPostgresContainer,
  teardownPostgresContainer,
  cleanDatabase,
} from './setup/pg-test-containers.setup';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { PgPurchaseRepository } from '@/infrastructure/persistence/postgresql/repositories/pg-purchase.repository';
import { Purchase } from '@/core/domain/purchase/entities/purchase.entity';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { UserId } from '@/core/domain/purchase/value-objects/user-id.vo';

describe('PgPurchaseRepository (Integration)', () => {
  let dataSource: DataSource;
  let purchaseRepo: PgPurchaseRepository;
  let productOrmRepo: Repository<ProductOrmEntity>;
  let purchaseOrmRepo: Repository<PurchaseOrmEntity>;
  let testProduct: ProductOrmEntity;

  beforeAll(async () => {
    const setup = await setupPostgresContainer();
    dataSource = setup.dataSource;
    productOrmRepo = dataSource.getRepository(ProductOrmEntity);
    purchaseOrmRepo = dataSource.getRepository(PurchaseOrmEntity);
    purchaseRepo = new PgPurchaseRepository(purchaseOrmRepo, productOrmRepo);
  }, 60_000);

  afterAll(async () => {
    await teardownPostgresContainer();
  }, 30_000);

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    testProduct = await productOrmRepo.save({
      sku: 'TEST-SKU-001',
      productName: 'Test Product',
      initialStock: 100,
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-12-31T23:59:59Z'),
      state: 'ACTIVE',
      createdBy: 'test',
    });
  });

  it('should persist a purchase successfully', async () => {
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-20250101-0001',
      sku: 'TEST-SKU-001',
      userId: 'user-1',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
    });

    await purchaseRepo.persist(purchase);

    const saved = await purchaseOrmRepo.findOne({
      where: { productId: testProduct.id, userId: 'user-1' },
    });

    expect(saved).not.toBeNull();
    expect(saved!.userId).toBe('user-1');
    expect(saved!.productId).toBe(testProduct.id);
  });

  it('should be idempotent — duplicate persist does not throw', async () => {
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-20250101-0001',
      sku: 'TEST-SKU-001',
      userId: 'user-1',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
    });

    await purchaseRepo.persist(purchase);
    await purchaseRepo.persist(purchase); // second persist should not throw

    const count = await purchaseOrmRepo.count({
      where: { productId: testProduct.id, userId: 'user-1' },
    });
    expect(count).toBe(1);
  });

  it('should skip persist when product not found', async () => {
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-20250101-0001',
      sku: 'NONEXISTENT-SKU',
      userId: 'user-1',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
    });

    await expect(purchaseRepo.persist(purchase)).resolves.toBeUndefined();
  });

  it('should find a purchase by user and SKU', async () => {
    await purchaseOrmRepo.save({
      productId: testProduct.id,
      userId: 'user-2',
      purchasedAt: new Date('2025-06-15T10:00:00Z'),
      createdBy: 'test',
    });

    const result = await purchaseRepo.findByUser(
      SKU.create('TEST-SKU-001'),
      UserId.create('user-2'),
    );

    expect(result).not.toBeNull();
    expect(result!.userId.value).toBe('user-2');
    expect(result!.sku.value).toBe('TEST-SKU-001');
  });

  it('should return null when purchase not found', async () => {
    const result = await purchaseRepo.findByUser(
      SKU.create('TEST-SKU-001'),
      UserId.create('nonexistent-user'),
    );

    expect(result).toBeNull();
  });

  it('should enforce unique constraint on (product_id, user_id)', async () => {
    await purchaseOrmRepo.save({
      productId: testProduct.id,
      userId: 'user-unique',
      purchasedAt: new Date(),
      createdBy: 'test',
    });

    // Direct insert (bypassing ON CONFLICT) should fail
    await expect(
      purchaseOrmRepo.save({
        productId: testProduct.id,
        userId: 'user-unique',
        purchasedAt: new Date(),
        createdBy: 'test',
      }),
    ).rejects.toThrow();
  });
});
