import { DomainEvent } from './domain-event.interface';
import { SKU } from '../value-objects/sku.vo';

export type SaleEndedReason = 'SOLD_OUT' | 'TIME_EXPIRED';

export class SaleEndedEvent implements DomainEvent {
  readonly occurredOn = new Date();
  constructor(
    readonly sku: SKU,
    readonly reason: SaleEndedReason,
  ) {}
}
