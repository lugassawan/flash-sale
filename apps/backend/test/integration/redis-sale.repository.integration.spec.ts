import Redis from 'ioredis';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import { RedisSaleRepository } from '../../src/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { SKU } from '../../src/core/domain/sale/value-objects/sku.vo';
import { UserId } from '../../src/core/domain/purchase/value-objects/user-id.vo';
import { Sale } from '../../src/core/domain/sale/entities/sale.entity';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('RedisSaleRepository (Integration)', () => {
  let client: Redis;
  let repository: RedisSaleRepository;

  beforeAll(async () => {
    const setup = await setupRedisContainer();
    client = setup.client;

    // Create repository with real Redis connection
    repository = new RedisSaleRepository(client);
    await repository.onModuleInit();
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
  }, 30_000);

  beforeEach(async () => {
    await client.flushdb();
    // Re-load scripts after flush
    await repository.onModuleInit();
  });

  const createTestSale = (
    overrides: Partial<{
      sku: string;
      productName: string;
      initialStock: number;
      startTime: Date;
      endTime: Date;
    }> = {},
  ): Sale => {
    const now = Date.now();
    return Sale.create({
      sku: overrides.sku ?? 'WIDGET-001',
      productName: overrides.productName ?? 'Test Widget',
      initialStock: overrides.initialStock ?? 100,
      startTime: overrides.startTime ?? new Date(now - 60_000),
      endTime: overrides.endTime ?? new Date(now + 3_600_000),
    });
  };

  describe('initializeSale', () => {
    it('should create all Redis keys correctly', async () => {
      const sale = createTestSale();
      await repository.initializeSale(sale);

      const state = await client.get('sale:WIDGET-001:state');
      const stock = await client.get('sale:WIDGET-001:stock');
      const config = await client.hgetall('sale:WIDGET-001:config');

      expect(state).toBe('UPCOMING');
      expect(stock).toBe('100');
      expect(config.sku).toBe('WIDGET-001');
      expect(config.productName).toBe('Test Widget');
      expect(config.initialStock).toBe('100');
      expect(config.startTime).toBeDefined();
      expect(config.endTime).toBeDefined();
    });

    it('should clear existing buyers on re-initialize', async () => {
      await client.sadd('sale:WIDGET-001:buyers', 'user-1', 'user-2');

      const sale = createTestSale();
      await repository.initializeSale(sale);

      const buyersCount = await client.scard('sale:WIDGET-001:buyers');
      expect(buyersCount).toBe(0);
    });
  });

  describe('getSaleStatus', () => {
    it('should return complete sale status', async () => {
      const sale = createTestSale();
      await repository.initializeSale(sale);

      // Manually set state to ACTIVE for testing
      await client.set('sale:WIDGET-001:state', 'ACTIVE');

      const status = await repository.getSaleStatus(SKU.create('WIDGET-001'));

      expect(status.sku).toBe('WIDGET-001');
      expect(status.state).toBe(SaleState.ACTIVE);
      expect(status.stock).toBe(100);
      expect(status.initialStock).toBe(100);
      expect(status.productName).toBe('Test Widget');
    });

    it('should return defaults for non-existent sale', async () => {
      const status = await repository.getSaleStatus(SKU.create('NONEXISTENT'));

      expect(status.sku).toBe('NONEXISTENT');
      expect(status.state).toBe(SaleState.UPCOMING);
      expect(status.stock).toBe(0);
    });
  });

  describe('attemptPurchase', () => {
    beforeEach(async () => {
      const sale = createTestSale({ initialStock: 10 });
      await repository.initializeSale(sale);
      // Set state to ACTIVE so purchases are allowed
      await client.set('sale:WIDGET-001:state', 'ACTIVE');
    });

    it('should succeed for valid purchase', async () => {
      const result = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.remainingStock).toBe(9);
        expect(result.purchaseNo).toMatch(/^PUR-\d{8}-\d{4}$/);
        expect(result.purchasedAt).toBeDefined();
      }
    });

    it('should reject when sale is not active', async () => {
      await client.set('sale:WIDGET-001:state', 'UPCOMING');

      const result = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('SALE_NOT_ACTIVE');
      }
    });

    it('should reject when sold out', async () => {
      await client.set('sale:WIDGET-001:stock', '0');

      const result = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('SOLD_OUT');
      }
    });

    it('should reject duplicate purchase (ALREADY_PURCHASED)', async () => {
      // First purchase should succeed
      const first = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );
      expect(first.status).toBe('success');

      // Second purchase by same user should be rejected
      const second = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );

      expect(second.status).toBe('rejected');
      if (second.status === 'rejected') {
        expect(second.code).toBe('ALREADY_PURCHASED');
      }
    });

    it('should transition to ENDED when stock hits zero', async () => {
      await client.set('sale:WIDGET-001:stock', '1');

      const result = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-last'),
      );

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.remainingStock).toBe(0);
      }

      // Verify state transitioned to ENDED
      const state = await client.get('sale:WIDGET-001:state');
      expect(state).toBe('ENDED');

      const endReason = await client.get('sale:WIDGET-001:end_reason');
      expect(endReason).toBe('SOLD_OUT');
    });

    it('should reject when end time has passed', async () => {
      // Set end time to the past
      await client.hset('sale:WIDGET-001:config', 'endTime', '1000');

      const result = await repository.attemptPurchase(
        SKU.create('WIDGET-001'),
        UserId.create('user-1'),
      );

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('SALE_NOT_ACTIVE');
      }

      // Verify inline state transition happened
      const state = await client.get('sale:WIDGET-001:state');
      expect(state).toBe('ENDED');
    });

    it('should decrement stock correctly for multiple different users', async () => {
      for (let i = 1; i <= 5; i++) {
        const result = await repository.attemptPurchase(
          SKU.create('WIDGET-001'),
          UserId.create(`user-${i}`),
        );
        expect(result.status).toBe('success');
        if (result.status === 'success') {
          expect(result.remainingStock).toBe(10 - i);
        }
      }

      const stock = await client.get('sale:WIDGET-001:stock');
      expect(stock).toBe('5');
    });
  });

  describe('concurrency', () => {
    it('should never oversell: 100 concurrent purchases with 10 stock', async () => {
      const sale = createTestSale({ initialStock: 10 });
      await repository.initializeSale(sale);
      await client.set('sale:WIDGET-001:state', 'ACTIVE');

      // Launch 100 concurrent purchases with unique users
      const promises = Array.from({ length: 100 }, (_, i) =>
        repository.attemptPurchase(SKU.create('WIDGET-001'), UserId.create(`concurrent-user-${i}`)),
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.status === 'success');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 10 should succeed (stock was 10)
      expect(successes).toHaveLength(10);
      // Remaining 90 should be rejected (SOLD_OUT or SALE_NOT_ACTIVE)
      // After the 10th purchase, state transitions to ENDED inline,
      // so subsequent requests see SALE_NOT_ACTIVE rather than SOLD_OUT
      expect(rejected).toHaveLength(90);
      for (const r of rejected) {
        if (r.status === 'rejected') {
          expect(['SOLD_OUT', 'SALE_NOT_ACTIVE']).toContain(r.code);
        }
      }

      // Verify stock is exactly 0, not negative
      const stock = await client.get('sale:WIDGET-001:stock');
      expect(parseInt(stock!, 10)).toBe(0);

      // Verify exactly 10 buyers in the set
      const buyersCount = await client.scard('sale:WIDGET-001:buyers');
      expect(buyersCount).toBe(10);

      // Verify sale ended
      const state = await client.get('sale:WIDGET-001:state');
      expect(state).toBe('ENDED');

      const endReason = await client.get('sale:WIDGET-001:end_reason');
      expect(endReason).toBe('SOLD_OUT');
    }, 30_000);

    it('should allow at most 1 purchase per user under concurrency', async () => {
      const sale = createTestSale({ initialStock: 100 });
      await repository.initializeSale(sale);
      await client.set('sale:WIDGET-001:state', 'ACTIVE');

      // Same user tries 50 concurrent purchases
      const promises = Array.from({ length: 50 }, () =>
        repository.attemptPurchase(SKU.create('WIDGET-001'), UserId.create('same-user')),
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.status === 'success');
      const duplicates = results.filter(
        (r) => r.status === 'rejected' && r.code === 'ALREADY_PURCHASED',
      );

      // Exactly 1 should succeed
      expect(successes).toHaveLength(1);
      // Remaining 49 should be ALREADY_PURCHASED
      expect(duplicates).toHaveLength(49);

      // Stock decremented exactly once
      const stock = await client.get('sale:WIDGET-001:stock');
      expect(parseInt(stock!, 10)).toBe(99);
    }, 30_000);
  });

  describe('transitionState', () => {
    it('should transition UPCOMING to ACTIVE when start time has passed', async () => {
      const sale = createTestSale({
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
      });
      await repository.initializeSale(sale);

      const result = await repository.transitionState(SKU.create('WIDGET-001'), new Date());

      expect(result).toBe('transitioned_to_active');

      const state = await client.get('sale:WIDGET-001:state');
      expect(state).toBe('ACTIVE');
    });

    it('should transition ACTIVE to ENDED when end time has passed', async () => {
      const sale = createTestSale({
        startTime: new Date(Date.now() - 3_600_000),
        endTime: new Date(Date.now() - 60_000),
      });
      await repository.initializeSale(sale);
      await client.set('sale:WIDGET-001:state', 'ACTIVE');

      const result = await repository.transitionState(SKU.create('WIDGET-001'), new Date());

      expect(result).toBe('transitioned_to_ended');

      const state = await client.get('sale:WIDGET-001:state');
      expect(state).toBe('ENDED');

      const endReason = await client.get('sale:WIDGET-001:end_reason');
      expect(endReason).toBe('TIME_EXPIRED');
    });

    it('should return no_transition when no transition is needed', async () => {
      const sale = createTestSale({
        startTime: new Date(Date.now() + 60_000),
        endTime: new Date(Date.now() + 3_600_000),
      });
      await repository.initializeSale(sale);

      const result = await repository.transitionState(SKU.create('WIDGET-001'), new Date());

      expect(result).toBe('no_transition');
    });
  });

  describe('deleteSale', () => {
    it('should remove all Redis keys for a sale', async () => {
      const sale = createTestSale();
      await repository.initializeSale(sale);
      await client.set('sale:WIDGET-001:state', 'ACTIVE');
      await client.sadd('sale:WIDGET-001:buyers', 'user-1');
      await client.set('sale:WIDGET-001:end_reason', 'SOLD_OUT');

      await repository.deleteSale(SKU.create('WIDGET-001'));

      const state = await client.get('sale:WIDGET-001:state');
      const stock = await client.get('sale:WIDGET-001:stock');
      const config = await client.hgetall('sale:WIDGET-001:config');
      const buyers = await client.scard('sale:WIDGET-001:buyers');
      const endReason = await client.get('sale:WIDGET-001:end_reason');

      expect(state).toBeNull();
      expect(stock).toBeNull();
      expect(Object.keys(config)).toHaveLength(0);
      expect(buyers).toBe(0);
      expect(endReason).toBeNull();
    });
  });
});
