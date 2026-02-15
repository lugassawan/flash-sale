import { DomainEvent } from './domain-event.interface';
import { SKU } from '../value-objects/sku.vo';
import { UserId } from '../../purchase/value-objects/user-id.vo';

export class PurchaseConfirmedEvent implements DomainEvent {
  readonly occurredOn = new Date();
  constructor(
    readonly sku: SKU,
    readonly userId: UserId,
    readonly remainingStock: number,
  ) {}
}
