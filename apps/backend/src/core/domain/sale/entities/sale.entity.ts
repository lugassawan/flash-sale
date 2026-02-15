import { SKU } from '../value-objects/sku.vo';
import { SaleState } from '../value-objects/sale-state.vo';
import { Stock } from '../value-objects/stock.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { UserId } from '../../purchase/value-objects/user-id.vo';
import { DomainEvent } from '../events/domain-event.interface';
import { SaleStartedEvent } from '../events/sale-started.event';
import { SaleEndedEvent } from '../events/sale-ended.event';
import { PurchaseConfirmedEvent } from '../events/purchase-confirmed.event';
import { StockDepletedEvent } from '../events/stock-depleted.event';
import { SaleStateMachine } from '../services/sale-state-machine.service';
import { InvalidStateTransitionError } from '../errors/invalid-state-transition.error';
import { SaleNotActiveError } from '../errors/sale-not-active.error';
import { SoldOutError } from '../errors/sold-out.error';
import { Purchase } from '../../purchase/entities/purchase.entity';

export class Sale {
  private constructor(
    private readonly _sku: SKU,
    private readonly _productName: string,
    private _state: SaleState,
    private _stock: Stock,
    private readonly _timeRange: TimeRange,
    private readonly _events: DomainEvent[] = [],
  ) {}

  static create(props: {
    sku: string;
    productName: string;
    initialStock: number;
    startTime: Date;
    endTime: Date;
  }): Sale {
    const sku = SKU.create(props.sku);
    const stock = Stock.create(props.initialStock);
    const timeRange = TimeRange.create(props.startTime, props.endTime);

    return new Sale(sku, props.productName, SaleState.UPCOMING, stock, timeRange);
  }

  static reconstitute(props: {
    sku: string;
    productName: string;
    state: SaleState;
    currentStock: number;
    startTime: Date;
    endTime: Date;
  }): Sale {
    return new Sale(
      SKU.create(props.sku),
      props.productName,
      props.state,
      Stock.create(props.currentStock),
      TimeRange.create(props.startTime, props.endTime),
    );
  }

  get sku(): SKU {
    return this._sku;
  }
  get productName(): string {
    return this._productName;
  }
  get state(): SaleState {
    return this._state;
  }
  get stock(): Stock {
    return this._stock;
  }
  get timeRange(): TimeRange {
    return this._timeRange;
  }
  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  canTransitionTo(target: SaleState, now: Date): boolean {
    return SaleStateMachine.canTransition(this._state, target, {
      now,
      timeRange: this._timeRange,
      stock: this._stock,
    });
  }

  transitionTo(target: SaleState, now: Date): void {
    if (!this.canTransitionTo(target, now)) {
      throw new InvalidStateTransitionError(this._state, target);
    }
    this._state = target;

    if (target === SaleState.ACTIVE) {
      this._events.push(new SaleStartedEvent(this._sku));
    }
    if (target === SaleState.ENDED) {
      const reason = this._stock.isZero ? 'SOLD_OUT' : 'TIME_EXPIRED';
      this._events.push(new SaleEndedEvent(this._sku, reason));
    }
  }

  attemptPurchase(userId: UserId): Purchase {
    if (this._state !== SaleState.ACTIVE) {
      throw new SaleNotActiveError();
    }
    if (this._stock.isZero) {
      throw new SoldOutError();
    }
    this._stock = this._stock.decrement();
    const purchase = Purchase.create(this._sku, userId);
    this._events.push(new PurchaseConfirmedEvent(this._sku, userId, this._stock.value));

    if (this._stock.isZero) {
      this._state = SaleState.ENDED;
      this._events.push(new SaleEndedEvent(this._sku, 'SOLD_OUT'));
      this._events.push(new StockDepletedEvent(this._sku));
    }

    return purchase;
  }

  clearEvents(): void {
    this._events.length = 0;
  }
}
