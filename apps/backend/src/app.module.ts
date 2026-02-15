import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/app-config.module';
import { RedisModule } from './infrastructure/persistence/redis/redis.module';
import { HealthController } from './presentation/http/rest/controllers/health.controller';
import { CorrelationIdMiddleware } from './presentation/http/rest/middleware/correlation-id.middleware';
import { UserIdMiddleware } from './presentation/http/rest/middleware/user-id.middleware';

@Module({
  imports: [AppConfigModule, RedisModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(UserIdMiddleware).forRoutes('api/*');
  }
}
