import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleEventsController } from './presentation/http/rest/sse/sale-events.controller';
import { SaleStateCronService } from './infrastructure/scheduling/sale-state-cron.service';
import { ReconciliationCronService } from './infrastructure/scheduling/reconciliation-cron.service';
import { ReconciliationService } from './infrastructure/scheduling/reconciliation.service';
import { TransitionSaleStateUseCase } from './application/use-cases/sale/transition-sale-state.use-case';
import { LoggingEventPublisher } from './infrastructure/messaging/logging-event-publisher.adapter';
import { EVENT_PUBLISHER } from './application/ports/event-publisher.port';
import { ProductOrmEntity } from './infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from './infrastructure/persistence/postgresql/entities/purchase.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrmEntity, PurchaseOrmEntity])],
  controllers: [SaleEventsController],
  providers: [
    SaleStateCronService,
    ReconciliationCronService,
    ReconciliationService,
    TransitionSaleStateUseCase,
    LoggingEventPublisher,
    {
      provide: EVENT_PUBLISHER,
      useExisting: LoggingEventPublisher,
    },
  ],
})
export class EventsModule {}
