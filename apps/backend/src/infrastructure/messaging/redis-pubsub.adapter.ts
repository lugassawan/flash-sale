import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { REDIS_CLIENT } from '../persistence/redis/redis.tokens';

export interface SaleEvent {
  event: 'stock-update' | 'state-change' | 'initial';
  data: Record<string, unknown>;
}

@Injectable()
export class RedisPubSubAdapter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubAdapter.name);
  private readonly subscriber: Redis;
  private readonly eventSubject = new Subject<SaleEvent>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.subscriber = this.redis.duplicate();
  }

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe('sale:events');
    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as SaleEvent;
        this.eventSubject.next(parsed);
      } catch (error) {
        this.logger.error(`Failed to parse sale event: ${message}`, error);
      }
    });
    this.logger.log('Subscribed to sale:events channel');
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe('sale:events');
    this.subscriber.disconnect();
    this.eventSubject.complete();
  }

  getEventStream(): Observable<SaleEvent> {
    return this.eventSubject.asObservable();
  }
}
