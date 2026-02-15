import { firstValueFrom, Subject, take, toArray } from 'rxjs';
import { SaleEventsController } from '../../src/presentation/http/rest/sse/sale-events.controller';
import {
  RedisPubSubAdapter,
  SaleEvent,
} from '../../src/infrastructure/messaging/redis-pubsub.adapter';
import {
  SaleRepository,
  SaleStatus,
} from '../../src/core/domain/sale/repositories/sale.repository';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleEventsController', () => {
  let controller: SaleEventsController;
  let mockSaleRepo: jest.Mocked<SaleRepository>;
  let mockPubSub: jest.Mocked<Pick<RedisPubSubAdapter, 'getEventStream'>>;
  let eventSubject: Subject<SaleEvent>;

  const saleStatus: SaleStatus = {
    sku: 'WIDGET-001',
    state: SaleState.ACTIVE,
    stock: 50,
    initialStock: 100,
    productName: 'Test Widget',
    startTime: '2026-01-01T00:00:00Z',
    endTime: '2026-01-02T00:00:00Z',
  };

  beforeEach(() => {
    eventSubject = new Subject<SaleEvent>();

    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };

    mockPubSub = {
      getEventStream: jest.fn().mockReturnValue(eventSubject.asObservable()),
    };

    mockSaleRepo.getSaleStatus.mockResolvedValue(saleStatus);

    controller = new SaleEventsController(
      mockPubSub as unknown as RedisPubSubAdapter,
      mockSaleRepo,
    );
  });

  afterEach(() => {
    eventSubject.complete();
  });

  describe('streamEvents', () => {
    it('should emit initial event with current sale status on connect', async () => {
      const observable = controller.streamEvents('WIDGET-001');
      const firstEvent = await firstValueFrom(observable);

      expect(firstEvent).toEqual({
        type: 'initial',
        data: saleStatus,
      });
      expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
      const skuArg = mockSaleRepo.getSaleStatus.mock.calls[0][0];
      expect(skuArg.value).toBe('WIDGET-001');
    });

    it('should stream live events filtered by SKU after initial event', async () => {
      const matchingEvent: SaleEvent = {
        event: 'stock-update',
        data: { sku: 'WIDGET-001', stock: 49 },
      };

      const nonMatchingEvent: SaleEvent = {
        event: 'stock-update',
        data: { sku: 'OTHER-SKU', stock: 10 },
      };

      const observable = controller.streamEvents('WIDGET-001');

      // Collect 2 events: initial + 1 matching live
      const eventsPromise = firstValueFrom(observable.pipe(take(2), toArray()));

      // Push live events after a microtask (to let initial$ complete)
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      eventSubject.next(nonMatchingEvent); // should be filtered out
      eventSubject.next(matchingEvent); // should come through

      const events = await eventsPromise;

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'initial', data: saleStatus });
      expect(events[1]).toEqual({
        type: 'stock-update',
        data: { sku: 'WIDGET-001', stock: 49 },
      });
    });

    it('should throw InvalidSKUError for invalid SKU format', () => {
      expect(() => controller.streamEvents('bad sku!')).toThrow();
    });
  });

  describe('connection tracking', () => {
    it('should start with zero active connections', () => {
      expect(controller.connectionCount).toBe(0);
    });

    it('should increment active connections on subscribe', async () => {
      const observable = controller.streamEvents('WIDGET-001');

      // Connection count is 0 before subscription (defer wraps the increment)
      expect(controller.connectionCount).toBe(0);

      const sub = observable.subscribe();
      // After subscription, defer fires and increments counter
      expect(controller.connectionCount).toBe(1);

      // Allow initial event to emit
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      sub.unsubscribe();
    });

    it('should decrement active connections on unsubscribe via finalize', async () => {
      const observable = controller.streamEvents('WIDGET-001');
      const sub = observable.subscribe();
      expect(controller.connectionCount).toBe(1);

      // Allow initial event to emit
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      sub.unsubscribe();
      expect(controller.connectionCount).toBe(0);
    });

    it('should track multiple concurrent connections independently', async () => {
      const obs1 = controller.streamEvents('WIDGET-001');
      const obs2 = controller.streamEvents('WIDGET-001');

      // Not yet subscribed
      expect(controller.connectionCount).toBe(0);

      const sub1 = obs1.subscribe();
      const sub2 = obs2.subscribe();
      expect(controller.connectionCount).toBe(2);

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      sub1.unsubscribe();
      expect(controller.connectionCount).toBe(1);

      sub2.unsubscribe();
      expect(controller.connectionCount).toBe(0);
    });
  });

  describe('deferred initial event', () => {
    it('should not call getSaleStatus until subscription occurs', () => {
      controller.streamEvents('WIDGET-001');
      expect(mockSaleRepo.getSaleStatus).not.toHaveBeenCalled();
    });

    it('should call getSaleStatus only when subscribed', async () => {
      const observable = controller.streamEvents('WIDGET-001');
      expect(mockSaleRepo.getSaleStatus).not.toHaveBeenCalled();

      const firstEvent = await firstValueFrom(observable);

      expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
      expect(firstEvent.type).toBe('initial');
    });
  });
});
