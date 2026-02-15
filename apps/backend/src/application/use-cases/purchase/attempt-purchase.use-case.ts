import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SALE_REPOSITORY,
  SaleRepository,
  PurchaseAttemptResult,
} from '@/core/domain/sale/repositories/sale.repository';
import { EVENT_PUBLISHER, EventPublisher } from '@/application/ports/event-publisher.port';
import {
  PURCHASE_PERSISTENCE,
  PurchasePersistencePort,
} from '@/application/ports/purchase-persistence.port';
import { UserId } from '@/core/domain/purchase/value-objects/user-id.vo';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { PurchaseConfirmedEvent } from '@/core/domain/sale/events/purchase-confirmed.event';

export interface AttemptPurchaseCommand {
  userId: string;
  sku: string;
}

@Injectable()
export class AttemptPurchaseUseCase {
  private readonly logger = new Logger(AttemptPurchaseUseCase.name);

  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
    @Inject(PURCHASE_PERSISTENCE)
    private readonly purchasePersistence: PurchasePersistencePort,
  ) {}

  async execute(command: AttemptPurchaseCommand): Promise<PurchaseAttemptResult> {
    const userId = UserId.create(command.userId);
    const sku = SKU.create(command.sku);

    this.logger.log(`Purchase attempt: user=${userId.value}, sku=${sku.value}`);

    const result = await this.saleRepo.attemptPurchase(sku, userId);

    if (result.status === 'success') {
      this.logger.log(
        `Purchase confirmed: user=${userId.value}, remaining=${result.remainingStock}`,
      );

      await this.eventPublisher.publish(
        new PurchaseConfirmedEvent(sku, userId, result.remainingStock),
      );

      await this.purchasePersistence.enqueue({
        purchaseNo: result.purchaseNo,
        sku: sku.value,
        userId: userId.value,
        purchasedAt: result.purchasedAt,
      });
    } else {
      this.logger.log(`Purchase rejected: user=${userId.value}, reason=${result.code}`);
    }

    return result;
  }
}
