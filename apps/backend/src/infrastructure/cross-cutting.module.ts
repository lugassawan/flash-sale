import { Global, Module } from '@nestjs/common';
import { RATE_LIMITER_STRATEGY } from './rate-limiting/rate-limiter.strategy';
import { SlidingWindowStrategy } from './rate-limiting/sliding-window.strategy';
import { RateLimitGuard } from './rate-limiting/rate-limit.guard';
import { StructuredLogger } from './logging/structured-logger';
import { MetricsService } from './observability/metrics.service';
import { MetricsController } from './observability/metrics.controller';
import { MetricsInterceptor } from './observability/metrics.interceptor';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: RATE_LIMITER_STRATEGY,
      useClass: SlidingWindowStrategy,
    },
    RateLimitGuard,
    StructuredLogger,
    MetricsService,
    MetricsInterceptor,
  ],
  exports: [
    RATE_LIMITER_STRATEGY,
    RateLimitGuard,
    StructuredLogger,
    MetricsService,
    MetricsInterceptor,
  ],
})
export class CrossCuttingModule {}
