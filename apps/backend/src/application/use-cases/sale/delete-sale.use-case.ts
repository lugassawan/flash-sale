import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';

@Injectable()
export class DeleteSaleUseCase {
  private readonly logger = new Logger(DeleteSaleUseCase.name);

  constructor(@Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository) {}

  async execute(sku: string): Promise<void> {
    const skuVo = SKU.create(sku);

    await this.saleRepo.deleteSale(skuVo);

    this.logger.log(`Sale deleted: sku=${skuVo.value}`);
  }
}
