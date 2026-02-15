import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/infrastructure/persistence/redis/redis.module';
import { RateLimiterStrategy } from './rate-limiter.strategy';

@Injectable()
export class SlidingWindowStrategy implements RateLimiterStrategy {
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.windowMs = 1_000;
    this.maxRequests = 1;
  }

  async isAllowed(key: string): Promise<boolean> {
    const now = Date.now();
    const windowKey = `rate:window:${key}`;
    const windowStart = now - this.windowMs;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(windowKey, 0, windowStart);
    pipeline.zadd(windowKey, now.toString(), `${now}-${Math.random()}`);
    pipeline.zcard(windowKey);
    pipeline.expire(windowKey, Math.ceil(this.windowMs / 1000));
    const results = await pipeline.exec();

    const count = results![2]![1] as number;
    return count <= this.maxRequests;
  }

  async getRetryAfter(_key: string): Promise<number> {
    return Math.ceil(this.windowMs / 1000);
  }
}
