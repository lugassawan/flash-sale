import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { Sale } from '@/core/domain/sale/entities/sale.entity';

export interface CreateSaleCommand {
  sku: string;
  productName: string;
  initialStock: number;
  startTime: string;
  endTime: string;
}

@Injectable()
export class CreateSaleUseCase {
  private readonly logger = new Logger(CreateSaleUseCase.name);

  constructor(@Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository) {}

  async execute(command: CreateSaleCommand): Promise<void> {
    const sale = Sale.create({
      sku: command.sku,
      productName: command.productName,
      initialStock: command.initialStock,
      startTime: new Date(command.startTime),
      endTime: new Date(command.endTime),
    });

    await this.saleRepo.initializeSale(sale);

    this.logger.log(`Sale created: sku=${sale.sku.value}`);
  }
}
