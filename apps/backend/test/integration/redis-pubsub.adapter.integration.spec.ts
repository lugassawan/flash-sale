import Redis from 'ioredis';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import {
  RedisPubSubAdapter,
  SaleEvent,
} from '../../src/infrastructure/messaging/redis-pubsub.adapter';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';

describe('RedisPubSubAdapter (Integration)', () => {
  let client: Redis;
  let adapter: RedisPubSubAdapter;

  beforeAll(async () => {
    const setup = await setupRedisContainer();
    client = setup.client;
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
  }, 30_000);

  beforeEach(async () => {
    await client.flushdb();
    adapter = new RedisPubSubAdapter(client);
    await adapter.onModuleInit();
  });

  afterEach(async () => {
    await adapter.onModuleDestroy();
  });

  it('should receive published events as Observable', async () => {
    const eventPromise = firstValueFrom(adapter.getEventStream().pipe(timeout(5_000)));

    // Small delay to ensure subscription is active
    await new Promise((resolve) => setTimeout(resolve, 100));

    const testEvent: SaleEvent = {
      event: 'stock-update',
      data: { sku: 'WIDGET-001', stock: 99 },
    };
    await client.publish('sale:events', JSON.stringify(testEvent));

    const received = await eventPromise;

    expect(received.event).toBe('stock-update');
    expect(received.data).toEqual({ sku: 'WIDGET-001', stock: 99 });
  });

  it('should receive multiple events in order', async () => {
    const eventsPromise = firstValueFrom(
      adapter.getEventStream().pipe(take(3), toArray(), timeout(5_000)),
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const events: SaleEvent[] = [
      { event: 'state-change', data: { sku: 'W1', state: 'ACTIVE' } },
      { event: 'stock-update', data: { sku: 'W1', stock: 9 } },
      { event: 'state-change', data: { sku: 'W1', state: 'ENDED', reason: 'SOLD_OUT' } },
    ];

    for (const event of events) {
      await client.publish('sale:events', JSON.stringify(event));
    }

    const received = await eventsPromise;

    expect(received).toHaveLength(3);
    expect(received[0].event).toBe('state-change');
    expect(received[1].event).toBe('stock-update');
    expect(received[2].data).toEqual({ sku: 'W1', state: 'ENDED', reason: 'SOLD_OUT' });
  });

  it('should only receive events from sale:events channel', async () => {
    const eventPromise = firstValueFrom(adapter.getEventStream().pipe(timeout(5_000)));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Publish to a different channel first — should be ignored
    await client.publish('other:channel', JSON.stringify({ event: 'ignored' }));

    // Then publish to sale:events — should be received
    await client.publish(
      'sale:events',
      JSON.stringify({ event: 'stock-update', data: { sku: 'W1', stock: 5 } }),
    );

    const received = await eventPromise;
    expect(received.event).toBe('stock-update');
  });
});
