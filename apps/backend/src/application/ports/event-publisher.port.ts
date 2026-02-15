import { DomainEvent } from '@/core/domain/sale/events/domain-event.interface';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
