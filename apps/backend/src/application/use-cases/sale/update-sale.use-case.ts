import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { Sale } from '@/core/domain/sale/entities/sale.entity';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';
import { ValidationError } from '@/application/errors/application.error';
import { parseRedisTimestamp } from '@/shared/parse-redis-timestamp';

export interface UpdateSaleCommand {
  sku: string;
  productName?: string;
  initialStock?: number;
  startTime?: string;
  endTime?: string;
}

@Injectable()
export class UpdateSaleUseCase {
  private readonly logger = new Logger(UpdateSaleUseCase.name);

  constructor(@Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository) {}

  async execute(command: UpdateSaleCommand): Promise<void> {
    const sku = SKU.create(command.sku);
    const status = await this.saleRepo.getSaleStatus(sku);

    if (status.state !== SaleState.UPCOMING) {
      throw new ValidationError(`Sale ${sku.value} cannot be modified in ${status.state} state`, {
        state: `Sale must be in UPCOMING state, currently ${status.state}`,
      });
    }

    const updatedSale = {
      sku: command.sku,
      productName: command.productName ?? status.productName,
      initialStock: command.initialStock ?? status.initialStock,
      startTime: command.startTime
        ? new Date(command.startTime)
        : parseRedisTimestamp(status.startTime),
      endTime: command.endTime ? new Date(command.endTime) : parseRedisTimestamp(status.endTime),
    };

    const sale = Sale.create(updatedSale);
    await this.saleRepo.initializeSale(sale);

    this.logger.log(`Sale updated: sku=${sku.value}`);
  }
}
