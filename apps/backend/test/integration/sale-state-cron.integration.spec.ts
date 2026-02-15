import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import { RedisSaleRepository } from '../../src/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { TransitionSaleStateUseCase } from '../../src/application/use-cases/sale/transition-sale-state.use-case';
import { SaleStateCronService } from '../../src/infrastructure/scheduling/sale-state-cron.service';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleStateCronService (Integration)', () => {
  let client: Redis;
  let subscriber: Redis;
  let saleRepo: RedisSaleRepository;
  let transitionUseCase: TransitionSaleStateUseCase;
  let cronService: SaleStateCronService;

  const TEST_SKU = 'WIDGET-001';

  // No-op event publisher for use case (domain events, not Redis pub/sub)
  const noOpEventPublisher = { publish: async () => {} };

  beforeAll(async () => {
    const setup = await setupRedisContainer();
    client = setup.client;
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
  }, 30_000);

  beforeEach(async () => {
    await client.flushdb();

    saleRepo = new RedisSaleRepository(client);
    await saleRepo.onModuleInit();

    // Create a dedicated subscriber for verifying published events.
    // This avoids issues with RedisPubSubAdapter's duplicate() and
    // ioredis auto-reconnection in subscriber mode between tests.
    subscriber = client.duplicate();
    await subscriber.subscribe('sale:events');

    // Create use case with real saleRepo and no-op event publisher
    transitionUseCase = new TransitionSaleStateUseCase(saleRepo, noOpEventPublisher);

    // Create cron service with real dependencies and mock ConfigService
    const mockConfigService = { get: () => 100 } as unknown as ConfigService;
    cronService = new SaleStateCronService(transitionUseCase, client, saleRepo, mockConfigService);
  });

  afterEach(async () => {
    await subscriber.unsubscribe('sale:events');
    subscriber.disconnect();
  });

  /**
   * Helper to seed a sale in Redis with specified timestamps.
   */
  async function seedSale(opts: {
    sku: string;
    state: SaleState;
    stock: number;
    startTime: number;
    endTime: number;
  }): Promise<void> {
    await client.set(`sale:${opts.sku}:state`, opts.state);
    await client.set(`sale:${opts.sku}:stock`, opts.stock.toString());
    await client.hset(`sale:${opts.sku}:config`, {
      sku: opts.sku,
      productName: 'Test Widget',
      initialStock: opts.stock.toString(),
      startTime: opts.startTime.toString(),
      endTime: opts.endTime.toString(),
    });
  }

  /**
   * Helper to wait for a message on the subscriber connection.
   */
  function waitForEvent(timeoutMs = 5_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        subscriber.removeAllListeners('message');
        reject(new Error(`Timed out waiting for event after ${timeoutMs}ms`));
      }, timeoutMs);

      subscriber.on('message', (_channel: string, message: string) => {
        clearTimeout(timer);
        subscriber.removeAllListeners('message');
        resolve(JSON.parse(message));
      });
    });
  }

  it('should transition UPCOMING to ACTIVE when start time has passed', async () => {
    const now = Date.now();
    await seedSale({
      sku: TEST_SKU,
      state: SaleState.UPCOMING,
      stock: 50,
      startTime: now - 60_000, // started 1 minute ago
      endTime: now + 3_600_000, // ends in 1 hour
    });

    // Set up event listener before triggering the transition
    const eventPromise = waitForEvent();

    // Run the cron handler which will call the Lua transition script
    await cronService.handleStateTransitions();

    // Verify state changed in Redis
    const state = await client.get(`sale:${TEST_SKU}:state`);
    expect(state).toBe('ACTIVE');

    // Verify the state-change event was published via Redis pub/sub
    const event = await eventPromise;
    expect(event).toEqual(
      expect.objectContaining({
        event: 'state-change',
        data: expect.objectContaining({
          sku: TEST_SKU,
          state: 'ACTIVE',
        }),
      }),
    );
  }, 15_000);

  it('should transition ACTIVE to ENDED when end time has passed', async () => {
    const now = Date.now();
    await seedSale({
      sku: TEST_SKU,
      state: SaleState.ACTIVE,
      stock: 50,
      startTime: now - 7_200_000, // started 2 hours ago
      endTime: now - 60_000, // ended 1 minute ago
    });

    // Set up event listener before triggering the transition
    const eventPromise = waitForEvent();

    await cronService.handleStateTransitions();

    // Verify state changed in Redis
    const state = await client.get(`sale:${TEST_SKU}:state`);
    expect(state).toBe('ENDED');

    // Verify end reason was set
    const endReason = await client.get(`sale:${TEST_SKU}:end_reason`);
    expect(endReason).toBe('TIME_EXPIRED');

    // Verify the state-change event was published
    const event = await eventPromise;
    expect(event).toEqual(
      expect.objectContaining({
        event: 'state-change',
        data: expect.objectContaining({
          sku: TEST_SKU,
          state: 'ENDED',
          reason: 'TIME_EXPIRED',
        }),
      }),
    );
  }, 15_000);

  it('should not transition when time has not arrived', async () => {
    const now = Date.now();
    await seedSale({
      sku: TEST_SKU,
      state: SaleState.UPCOMING,
      stock: 50,
      startTime: now + 3_600_000, // starts in 1 hour (future)
      endTime: now + 7_200_000, // ends in 2 hours (future)
    });

    await cronService.handleStateTransitions();

    // Verify state remains UPCOMING
    const state = await client.get(`sale:${TEST_SKU}:state`);
    expect(state).toBe(SaleState.UPCOMING);
  });

  it('should skip sales that are already ENDED', async () => {
    const now = Date.now();
    await seedSale({
      sku: TEST_SKU,
      state: SaleState.ENDED,
      stock: 0,
      startTime: now - 7_200_000,
      endTime: now - 3_600_000,
    });

    await cronService.handleStateTransitions();

    // State should still be ENDED (no error, just skipped)
    const state = await client.get(`sale:${TEST_SKU}:state`);
    expect(state).toBe(SaleState.ENDED);
  });
});
