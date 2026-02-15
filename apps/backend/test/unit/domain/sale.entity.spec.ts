import { Sale } from '../../../src/core/domain/sale/entities/sale.entity';
import { SaleState } from '../../../src/core/domain/sale/value-objects/sale-state.vo';
import { UserId } from '../../../src/core/domain/purchase/value-objects/user-id.vo';
import { SaleNotActiveError } from '../../../src/core/domain/sale/errors/sale-not-active.error';
import { SoldOutError } from '../../../src/core/domain/sale/errors/sold-out.error';
import { InvalidStateTransitionError } from '../../../src/core/domain/sale/errors/invalid-state-transition.error';

describe('Sale Entity', () => {
  const now = new Date('2026-02-15T10:00:00Z');
  const future = new Date('2026-02-15T11:00:00Z');
  const farFuture = new Date('2026-02-15T12:00:00Z');
  const past = new Date('2026-02-15T09:00:00Z');

  function createSale(
    overrides: Partial<{
      initialStock: number;
      startTime: Date;
      endTime: Date;
    }> = {},
  ): Sale {
    return Sale.create({
      sku: 'WIDGET-001',
      productName: 'Test Widget',
      initialStock: overrides.initialStock ?? 10,
      startTime: overrides.startTime ?? past,
      endTime: overrides.endTime ?? future,
    });
  }

  describe('creation', () => {
    it('should create with valid properties', () => {
      const sale = createSale();
      expect(sale.sku.value).toBe('WIDGET-001');
      expect(sale.productName).toBe('Test Widget');
      expect(sale.stock.value).toBe(10);
    });

    it('should start in UPCOMING state', () => {
      const sale = createSale();
      expect(sale.state).toBe(SaleState.UPCOMING);
    });

    it('should start with empty domain events', () => {
      const sale = createSale();
      expect(sale.domainEvents).toHaveLength(0);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from stored data with existing state', () => {
      const sale = Sale.reconstitute({
        sku: 'WIDGET-001',
        productName: 'Test Widget',
        state: SaleState.ACTIVE,
        currentStock: 5,
        startTime: past,
        endTime: future,
      });
      expect(sale.sku.value).toBe('WIDGET-001');
      expect(sale.state).toBe(SaleState.ACTIVE);
      expect(sale.stock.value).toBe(5);
    });

    it('should reconstitute with ENDED state', () => {
      const sale = Sale.reconstitute({
        sku: 'WIDGET-001',
        productName: 'Test Widget',
        state: SaleState.ENDED,
        currentStock: 0,
        startTime: past,
        endTime: future,
      });
      expect(sale.state).toBe(SaleState.ENDED);
      expect(sale.stock.isZero).toBe(true);
    });

    it('should reconstitute with empty domain events', () => {
      const sale = Sale.reconstitute({
        sku: 'WIDGET-001',
        productName: 'Test Widget',
        state: SaleState.ACTIVE,
        currentStock: 10,
        startTime: past,
        endTime: future,
      });
      expect(sale.domainEvents).toHaveLength(0);
    });
  });

  describe('state transitions', () => {
    it('should transition UPCOMING → ACTIVE when start time reached', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      expect(sale.state).toBe(SaleState.ACTIVE);
    });

    it('should emit SaleStartedEvent on ACTIVE transition', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      expect(sale.domainEvents).toHaveLength(1);
      expect(sale.domainEvents[0].constructor.name).toBe('SaleStartedEvent');
    });

    it('should not transition UPCOMING → ACTIVE before start time', () => {
      const sale = createSale({ startTime: future, endTime: farFuture });
      expect(sale.canTransitionTo(SaleState.ACTIVE, now)).toBe(false);
    });

    it('should throw InvalidStateTransitionError on invalid transition', () => {
      const sale = createSale({ startTime: future, endTime: farFuture });
      expect(() => sale.transitionTo(SaleState.ACTIVE, now)).toThrow(InvalidStateTransitionError);
    });

    it('should transition ACTIVE → ENDED when end time reached', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.transitionTo(SaleState.ENDED, future);
      expect(sale.state).toBe(SaleState.ENDED);
    });

    it('should emit SaleEndedEvent with TIME_EXPIRED reason', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.clearEvents();
      sale.transitionTo(SaleState.ENDED, future);
      expect(sale.domainEvents).toHaveLength(1);
      expect(sale.domainEvents[0].constructor.name).toBe('SaleEndedEvent');
    });

    it('should emit SaleEndedEvent with SOLD_OUT reason via transitionTo when stock is zero', () => {
      const sale = createSale({ initialStock: 0 });
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.clearEvents();
      sale.transitionTo(SaleState.ENDED, now);
      expect(sale.domainEvents).toHaveLength(1);
      const event = sale.domainEvents[0] as any;
      expect(event.constructor.name).toBe('SaleEndedEvent');
      expect(event.reason).toBe('SOLD_OUT');
    });

    it('should not allow transitions out of ENDED', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.transitionTo(SaleState.ENDED, future);
      expect(sale.canTransitionTo(SaleState.ACTIVE, now)).toBe(false);
      expect(sale.canTransitionTo(SaleState.UPCOMING, now)).toBe(false);
    });

    it('should throw when trying to transition out of ENDED', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.transitionTo(SaleState.ENDED, future);
      expect(() => sale.transitionTo(SaleState.ACTIVE, now)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('purchase attempts', () => {
    it('should allow purchase when ACTIVE with stock', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      const purchase = sale.attemptPurchase(UserId.create('alice@test.com'));
      expect(purchase).toBeDefined();
      expect(sale.stock.value).toBe(9);
    });

    it('should emit PurchaseConfirmedEvent on purchase', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.clearEvents();
      sale.attemptPurchase(UserId.create('alice@test.com'));
      const events = sale.domainEvents.map((e) => e.constructor.name);
      expect(events).toContain('PurchaseConfirmedEvent');
    });

    it('should transition to ENDED when last unit sold', () => {
      const sale = createSale({ initialStock: 1 });
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.attemptPurchase(UserId.create('alice@test.com'));
      expect(sale.state).toBe(SaleState.ENDED);
    });

    it('should emit StockDepletedEvent and SaleEndedEvent when stock hits zero', () => {
      const sale = createSale({ initialStock: 1 });
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.clearEvents();
      sale.attemptPurchase(UserId.create('alice@test.com'));
      const events = sale.domainEvents.map((e) => e.constructor.name);
      expect(events).toContain('PurchaseConfirmedEvent');
      expect(events).toContain('SaleEndedEvent');
      expect(events).toContain('StockDepletedEvent');
    });

    it('should emit events in correct order when stock depletes via attemptPurchase', () => {
      const sale = createSale({ initialStock: 1 });
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.clearEvents();
      sale.attemptPurchase(UserId.create('alice@test.com'));
      const names = sale.domainEvents.map((e) => e.constructor.name);
      expect(names).toEqual(['PurchaseConfirmedEvent', 'SaleEndedEvent', 'StockDepletedEvent']);
    });

    it('should throw SaleNotActiveError when UPCOMING', () => {
      const sale = createSale({ startTime: future, endTime: farFuture });
      expect(() => sale.attemptPurchase(UserId.create('alice@test.com'))).toThrow(
        SaleNotActiveError,
      );
      expect(() => sale.attemptPurchase(UserId.create('alice@test.com'))).toThrow(
        'The sale is not currently active.',
      );
    });

    it('should throw SaleNotActiveError when ENDED', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.transitionTo(SaleState.ENDED, future);
      expect(() => sale.attemptPurchase(UserId.create('alice@test.com'))).toThrow(
        SaleNotActiveError,
      );
    });

    it('should throw SoldOutError when stock is zero', () => {
      // Create with 0 stock and transition to ACTIVE — the UPCOMING→ACTIVE
      // guard only checks time, not stock, so this is a valid state.
      const sale = createSale({ initialStock: 0 });
      sale.transitionTo(SaleState.ACTIVE, now);
      expect(() => sale.attemptPurchase(UserId.create('alice@test.com'))).toThrow(SoldOutError);
      expect(() => sale.attemptPurchase(UserId.create('alice@test.com'))).toThrow(
        'Sorry, all items have been sold.',
      );
    });

    it('should decrement stock by exactly 1 per purchase', () => {
      const sale = createSale({ initialStock: 5 });
      sale.transitionTo(SaleState.ACTIVE, now);
      sale.attemptPurchase(UserId.create('user1'));
      sale.attemptPurchase(UserId.create('user2'));
      sale.attemptPurchase(UserId.create('user3'));
      expect(sale.stock.value).toBe(2);
    });
  });

  describe('clearEvents', () => {
    it('should clear all domain events', () => {
      const sale = createSale();
      sale.transitionTo(SaleState.ACTIVE, now);
      expect(sale.domainEvents.length).toBeGreaterThan(0);
      sale.clearEvents();
      expect(sale.domainEvents).toHaveLength(0);
    });
  });
});
