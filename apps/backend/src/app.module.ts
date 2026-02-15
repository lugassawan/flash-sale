import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/app-config.module';
import { RedisModule } from './infrastructure/persistence/redis/redis.module';
import { PostgresqlModule } from './infrastructure/persistence/postgresql/postgresql.module';
import { BullmqModule } from './infrastructure/messaging/bullmq/bullmq.module';
import { ProductModule } from './product.module';
import { SaleModule } from './sale.module';
import { PurchaseModule } from './purchase.module';
import { HealthController } from './presentation/http/rest/controllers/health.controller';
import { CorrelationIdMiddleware } from './presentation/http/rest/middleware/correlation-id.middleware';
import { UserIdMiddleware } from './presentation/http/rest/middleware/user-id.middleware';
import { ReconciliationService } from './infrastructure/scheduling/reconciliation.service';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    PostgresqlModule,
    BullmqModule,
    ProductModule,
    SaleModule,
    PurchaseModule,
  ],
  controllers: [HealthController],
  providers: [ReconciliationService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(UserIdMiddleware).forRoutes('api/*');
  }
}
