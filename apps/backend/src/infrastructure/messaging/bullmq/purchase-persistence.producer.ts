import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PurchasePersistencePort,
  PurchaseJobData,
} from '@/application/ports/purchase-persistence.port';
import { PURCHASE_QUEUE } from './bullmq.tokens';

@Injectable()
export class PurchasePersistenceProducer implements PurchasePersistencePort {
  private readonly logger = new Logger(PurchasePersistenceProducer.name);

  constructor(
    @InjectQueue(PURCHASE_QUEUE)
    private readonly queue: Queue<PurchaseJobData>,
  ) {}

  async enqueue(job: PurchaseJobData): Promise<void> {
    await this.queue.add('persist-purchase', job, {
      jobId: `purchase-${job.purchaseNo}`,
    });
    this.logger.log(`Enqueued purchase persistence: ${job.purchaseNo}`);
  }
}
