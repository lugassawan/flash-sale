import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@/application/ports/event-publisher.port';
import { DomainEvent } from '@/core/domain/sale/events/domain-event.interface';

@Injectable()
export class LoggingEventPublisher implements EventPublisher {
  private readonly logger = new Logger(LoggingEventPublisher.name);

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(`Domain event: ${event.constructor.name} at ${event.occurredOn.toISOString()}`);
  }
}
