import Redis from 'ioredis';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import { RedisPubSubAdapter } from '../../src/infrastructure/messaging/redis-pubsub.adapter';
import { RedisSaleRepository } from '../../src/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { SaleEventsController } from '../../src/presentation/http/rest/sse/sale-events.controller';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service';

describe('SaleEventsController (Integration)', () => {
  let client: Redis;
  let pubSubAdapter: RedisPubSubAdapter;
  let saleRepo: RedisSaleRepository;
  let controller: SaleEventsController;

  const TEST_SKU = 'WIDGET-001';

  beforeAll(async () => {
    const setup = await setupRedisContainer();
    client = setup.client;
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
  }, 30_000);

  beforeEach(async () => {
    await client.flushdb();

    // Create real adapters with the test Redis client
    pubSubAdapter = new RedisPubSubAdapter(client);
    saleRepo = new RedisSaleRepository(client);

    await pubSubAdapter.onModuleInit();
    await saleRepo.onModuleInit();

    // Seed sale data in Redis
    const now = Date.now();
    await client.set(`sale:${TEST_SKU}:state`, SaleState.ACTIVE);
    await client.set(`sale:${TEST_SKU}:stock`, '100');
    await client.hset(`sale:${TEST_SKU}:config`, {
      sku: TEST_SKU,
      productName: 'Test Widget',
      initialStock: '100',
      startTime: (now - 60_000).toString(),
      endTime: (now + 3_600_000).toString(),
    });

    // Create controller with real dependencies (bypass NestJS DI)
    const mockMetrics = {
      sseConnectionsGauge: { inc: jest.fn(), dec: jest.fn() },
    } as unknown as MetricsService;
    controller = new SaleEventsController(pubSubAdapter, saleRepo, mockMetrics);
  });

  afterEach(async () => {
    await pubSubAdapter.onModuleDestroy();
  });

  it('should send initial event with current sale state', async () => {
    const stream$ = controller.streamEvents(TEST_SKU);

    // Take only the first event (initial) and apply a timeout
    const initialEvent = await firstValueFrom(stream$.pipe(take(1), timeout(5_000)));

    expect(initialEvent.type).toBe('initial');
    expect(initialEvent.data).toEqual(
      expect.objectContaining({
        sku: TEST_SKU,
        state: SaleState.ACTIVE,
        stock: 100,
        initialStock: 100,
        productName: 'Test Widget',
      }),
    );
  });

  it('should stream live events after initial', async () => {
    const stream$ = controller.streamEvents(TEST_SKU);

    // Collect the initial event + 1 live event = 2 events total
    const eventsPromise = firstValueFrom(stream$.pipe(take(2), toArray(), timeout(5_000)));

    // Wait briefly for the subscription to be active
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Publish a stock-update event via Redis pub/sub
    await client.publish(
      'sale:events',
      JSON.stringify({
        event: 'stock-update',
        data: { sku: TEST_SKU, stock: 99 },
      }),
    );

    const events = await eventsPromise;

    expect(events).toHaveLength(2);

    // First event should be the initial state
    expect(events[0].type).toBe('initial');
    expect(events[0].data).toEqual(
      expect.objectContaining({
        sku: TEST_SKU,
        state: SaleState.ACTIVE,
      }),
    );

    // Second event should be the live stock-update
    expect(events[1].type).toBe('stock-update');
    expect(events[1].data).toEqual({ sku: TEST_SKU, stock: 99 });
  });

  it('should track active connection count', async () => {
    expect(controller.connectionCount).toBe(0);

    const stream$ = controller.streamEvents(TEST_SKU);

    // Subscribe to start the stream and increment the connection count
    const eventsPromise = firstValueFrom(stream$.pipe(take(1), toArray(), timeout(5_000)));

    // Connection count should be 1 while subscribed
    expect(controller.connectionCount).toBe(1);

    // Wait for the event to arrive and subscription to finalize
    await eventsPromise;

    // After take(1) completes and finalize runs, count should return to 0
    expect(controller.connectionCount).toBe(0);
  });
});
