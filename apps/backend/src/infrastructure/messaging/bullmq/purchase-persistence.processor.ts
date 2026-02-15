import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PURCHASE_REPOSITORY,
  PurchaseRepository,
} from '@/core/domain/sale/repositories/purchase.repository';
import { Purchase } from '@/core/domain/purchase/entities/purchase.entity';
import { PurchaseJobData } from '@/application/ports/purchase-persistence.port';
import { CircuitBreaker } from '../../persistence/postgresql/circuit-breaker';
import { PURCHASE_QUEUE } from './bullmq.module';

@Processor(PURCHASE_QUEUE)
export class PurchasePersistenceProcessor extends WorkerHost {
  private readonly logger = new Logger(PurchasePersistenceProcessor.name);

  constructor(
    @Inject(PURCHASE_REPOSITORY)
    private readonly purchaseRepo: PurchaseRepository,
    private readonly circuitBreaker: CircuitBreaker,
  ) {
    super();
  }

  async process(job: Job<PurchaseJobData>): Promise<void> {
    const { purchaseNo, sku, userId, purchasedAt } = job.data;
    this.logger.log(`Persisting purchase: ${purchaseNo}`);

    await this.circuitBreaker.run(async () => {
      const purchase = Purchase.reconstitute({
        purchaseNo,
        sku,
        userId,
        purchasedAt: new Date(purchasedAt),
      });
      await this.purchaseRepo.persist(purchase);
    });

    this.logger.log(`Purchase persisted to PostgreSQL: ${purchaseNo}`);
  }
}
