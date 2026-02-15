import { Logger, Module } from '@nestjs/common';
import { PurchaseController } from './presentation/http/rest/controllers/purchase.controller';
import { AttemptPurchaseUseCase } from './application/use-cases/purchase/attempt-purchase.use-case';
import { GetPurchaseStatusUseCase } from './application/use-cases/purchase/get-purchase-status.use-case';
import { EVENT_PUBLISHER, EventPublisher } from './application/ports/event-publisher.port';
import { DomainEvent } from './core/domain/sale/events/domain-event.interface';

const logger = new Logger('LoggingEventPublisher');

const loggingEventPublisher: EventPublisher = {
  async publish(event: DomainEvent): Promise<void> {
    logger.log(`Domain event: ${event.constructor.name}`);
  },
};

@Module({
  controllers: [PurchaseController],
  providers: [
    AttemptPurchaseUseCase,
    GetPurchaseStatusUseCase,
    { provide: EVENT_PUBLISHER, useValue: loggingEventPublisher },
  ],
})
export class PurchaseModule {}
