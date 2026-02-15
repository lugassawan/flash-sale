import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisSaleRepository } from './repositories/redis-sale.repository';
import { RedisPubSubAdapter } from '../../messaging/redis-pubsub.adapter';
import { SALE_REPOSITORY } from '@/core/domain/sale/repositories/sale.repository';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 200, 2000),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: SALE_REPOSITORY,
      useClass: RedisSaleRepository,
    },
    RedisPubSubAdapter,
  ],
  exports: [REDIS_CLIENT, SALE_REPOSITORY, RedisPubSubAdapter],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
