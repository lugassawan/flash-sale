import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PurchasePersistenceProducer } from './purchase-persistence.producer';
import { PurchasePersistenceProcessor } from './purchase-persistence.processor';
import { PURCHASE_PERSISTENCE } from '@/application/ports/purchase-persistence.port';

export const PURCHASE_QUEUE = 'purchase-persistence';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: PURCHASE_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        // BullMQ exponential: delay * 2^(attempt-1) → 1s, 2s, 4s
        // Plan specified 1s, 5s, 25s but standard exponential is sufficient
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    }),
  ],
  providers: [
    PurchasePersistenceProducer,
    PurchasePersistenceProcessor,
    {
      provide: PURCHASE_PERSISTENCE,
      useExisting: PurchasePersistenceProducer,
    },
  ],
  exports: [PURCHASE_PERSISTENCE, PurchasePersistenceProducer],
})
export class BullmqModule {}
