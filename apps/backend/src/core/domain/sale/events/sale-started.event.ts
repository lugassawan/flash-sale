import { DomainEvent } from './domain-event.interface';
import { SKU } from '../value-objects/sku.vo';

export class SaleStartedEvent implements DomainEvent {
  readonly occurredOn = new Date();
  constructor(readonly sku: SKU) {}
}
