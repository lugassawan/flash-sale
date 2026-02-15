import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { EVENT_PUBLISHER, EventPublisher } from '@/application/ports/event-publisher.port';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { SaleStartedEvent } from '@/core/domain/sale/events/sale-started.event';
import { SaleEndedEvent } from '@/core/domain/sale/events/sale-ended.event';

@Injectable()
export class TransitionSaleStateUseCase {
  private readonly logger = new Logger(TransitionSaleStateUseCase.name);

  constructor(
    @Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(sku: string): Promise<string> {
    const skuVo = SKU.create(sku);
    const now = new Date();

    this.logger.log(`Transition check: sku=${skuVo.value}`);

    const newState = await this.saleRepo.transitionState(skuVo, now);

    if (newState === 'ACTIVE') {
      await this.eventPublisher.publish(new SaleStartedEvent(skuVo));
      this.logger.log(`Sale started: sku=${skuVo.value}`);
    } else if (newState === 'ENDED') {
      await this.eventPublisher.publish(new SaleEndedEvent(skuVo, 'TIME_EXPIRED'));
      this.logger.log(`Sale ended: sku=${skuVo.value}`);
    } else {
      this.logger.log(`No transition: sku=${skuVo.value}, state=${newState}`);
    }

    return newState;
  }
}
