import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import {
  setupPostgresContainer,
  teardownPostgresContainer,
  cleanDatabase,
} from './setup/pg-test-containers.setup';
import { RedisSaleRepository } from '../../src/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { PgPurchaseRepository } from '../../src/infrastructure/persistence/postgresql/repositories/pg-purchase.repository';
import { ProductOrmEntity } from '../../src/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '../../src/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { PurchaseController } from '../../src/presentation/http/rest/controllers/purchase.controller';
import { AttemptPurchaseUseCase } from '../../src/application/use-cases/purchase/attempt-purchase.use-case';
import { GetPurchaseStatusUseCase } from '../../src/application/use-cases/purchase/get-purchase-status.use-case';
import { EventPublisher } from '../../src/application/ports/event-publisher.port';
import { PurchasePersistencePort } from '../../src/application/ports/purchase-persistence.port';
import { Sale } from '../../src/core/domain/sale/entities/sale.entity';
import { NotFoundError } from '../../src/application/errors/application.error';

describe('PurchaseController (Integration)', () => {
  let redisClient: Redis;
  let dataSource: DataSource;
  let saleRepo: RedisSaleRepository;
  let purchaseRepo: PgPurchaseRepository;
  let productOrmRepo: Repository<ProductOrmEntity>;
  let purchaseOrmRepo: Repository<PurchaseOrmEntity>;
  let controller: PurchaseController;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let mockPurchasePersistence: jest.Mocked<PurchasePersistencePort>;

  beforeAll(async () => {
    const [redisSetup, pgSetup] = await Promise.all([
      setupRedisContainer(),
      setupPostgresContainer(),
    ]);

    redisClient = redisSetup.client;
    dataSource = pgSetup.dataSource;

    saleRepo = new RedisSaleRepository(redisClient);
    await saleRepo.onModuleInit();

    productOrmRepo = dataSource.getRepository(ProductOrmEntity);
    purchaseOrmRepo = dataSource.getRepository(PurchaseOrmEntity);
    purchaseRepo = new PgPurchaseRepository(purchaseOrmRepo, productOrmRepo);

    mockEventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    mockPurchasePersistence = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const attemptPurchase = new AttemptPurchaseUseCase(
      saleRepo,
      mockEventPublisher,
      mockPurchasePersistence,
    );
    const getPurchaseStatus = new GetPurchaseStatusUseCase(purchaseRepo);
    controller = new PurchaseController(attemptPurchase, getPurchaseStatus);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([teardownRedisContainer(), teardownPostgresContainer()]);
  }, 30_000);

  beforeEach(async () => {
    await Promise.all([redisClient.flushdb(), cleanDatabase(dataSource)]);
    await saleRepo.onModuleInit();
    mockEventPublisher.publish.mockClear();
    mockPurchasePersistence.enqueue.mockClear();
  });

  const initActiveSale = async (stock = 100): Promise<void> => {
    const now = Date.now();
    const sale = Sale.create({
      sku: 'WIDGET-001',
      productName: 'Test Widget',
      initialStock: stock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 3_600_000),
    });
    await saleRepo.initializeSale(sale);
    await redisClient.set('sale:WIDGET-001:state', 'ACTIVE');
  };

  describe('POST /api/v1/purchases — success', () => {
    it('should return purchase data on successful purchase', async () => {
      await initActiveSale();

      const result = await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });

      expect(result).toEqual({
        purchaseNo: expect.stringMatching(/^PUR-\d{8}-\d{4}$/),
        purchasedAt: expect.any(String),
      });
    });

    it('should publish event and enqueue persistence on success', async () => {
      await initActiveSale();

      await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });

      expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(mockPurchasePersistence.enqueue).toHaveBeenCalledTimes(1);
      expect(mockPurchasePersistence.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'WIDGET-001',
          userId: 'alice@test.com',
          purchaseNo: expect.stringMatching(/^PUR-\d{8}-\d{4}$/),
        }),
      );
    });
  });

  describe('POST /api/v1/purchases — rejections', () => {
    it('should reject with SALE_NOT_ACTIVE when sale is upcoming', async () => {
      const now = Date.now();
      const sale = Sale.create({
        sku: 'WIDGET-001',
        productName: 'Test Widget',
        initialStock: 100,
        startTime: new Date(now + 60_000),
        endTime: new Date(now + 3_600_000),
      });
      await saleRepo.initializeSale(sale);
      // State remains UPCOMING (default)

      const result = await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });

      expect(result).toEqual({
        success: false,
        error: { code: 'SALE_NOT_ACTIVE', message: 'Sale is not currently active.' },
      });
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should reject with SOLD_OUT when stock is zero', async () => {
      await initActiveSale(0);

      const result = await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });

      expect(result).toEqual({
        success: false,
        error: { code: 'SOLD_OUT', message: 'Sorry, all items have been sold.' },
      });
    });

    it('should reject with ALREADY_PURCHASED on duplicate attempt', async () => {
      await initActiveSale();

      // First purchase succeeds
      const first = await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });
      expect(first).toHaveProperty('purchaseNo');

      // Second purchase by same user is rejected
      const second = await controller.purchase('alice@test.com', { sku: 'WIDGET-001' });
      expect(second).toEqual({
        success: false,
        error: {
          code: 'ALREADY_PURCHASED',
          message: 'You have already purchased this item.',
        },
      });
    });
  });

  describe('GET /api/v1/purchases — lookup', () => {
    it('should return purchase record when found in PostgreSQL', async () => {
      // Create product and purchase directly in PG
      const product = await productOrmRepo.save({
        sku: 'WIDGET-001',
        productName: 'Test Widget',
        initialStock: 100,
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: new Date('2026-12-31T23:59:59Z'),
        state: 'ACTIVE',
        createdBy: 'test',
      });

      await purchaseOrmRepo.save({
        productId: product.id,
        userId: 'alice@test.com',
        purchasedAt: new Date('2026-02-15T10:00:01.234Z'),
        createdBy: 'test',
      });

      const result = await controller.getStatus('alice@test.com', { sku: 'WIDGET-001' });

      expect(result).toEqual({
        purchaseNo: expect.any(String),
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });
    });

    it('should throw NotFoundError when no purchase exists', async () => {
      await expect(
        controller.getStatus('nonexistent@test.com', { sku: 'WIDGET-001' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Full lifecycle', () => {
    it('should support: create sale → purchase → check → reject duplicate', async () => {
      // 1. Initialize an active sale
      await initActiveSale(10);

      // 2. First purchase succeeds
      const purchaseResult = await controller.purchase('buyer@test.com', {
        sku: 'WIDGET-001',
      });
      expect(purchaseResult).toHaveProperty('purchaseNo');
      expect(purchaseResult).toHaveProperty('purchasedAt');

      // 3. Duplicate purchase is rejected
      const duplicateResult = await controller.purchase('buyer@test.com', {
        sku: 'WIDGET-001',
      });
      expect(duplicateResult).toEqual({
        success: false,
        error: {
          code: 'ALREADY_PURCHASED',
          message: 'You have already purchased this item.',
        },
      });

      // 4. Different user can still purchase
      const otherResult = await controller.purchase('other@test.com', {
        sku: 'WIDGET-001',
      });
      expect(otherResult).toHaveProperty('purchaseNo');
    });

    it('should sell out: N purchases exhaust stock, next is rejected', async () => {
      await initActiveSale(3);

      // 3 purchases succeed
      for (let i = 1; i <= 3; i++) {
        const result = await controller.purchase(`user-${i}@test.com`, {
          sku: 'WIDGET-001',
        });
        expect(result).toHaveProperty('purchaseNo');
      }

      // 4th purchase is rejected (sold out or sale ended)
      const result = await controller.purchase('user-4@test.com', { sku: 'WIDGET-001' });
      expect(result).toHaveProperty('success', false);
      expect((result as any).error.code).toMatch(/SOLD_OUT|SALE_NOT_ACTIVE/);
    });
  });
});
