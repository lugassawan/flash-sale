import { Inject, Injectable } from '@nestjs/common';
import {
  SALE_REPOSITORY,
  SaleRepository,
  SaleStatus,
} from '@/core/domain/sale/repositories/sale.repository';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';

@Injectable()
export class GetSaleStatusUseCase {
  constructor(@Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository) {}

  async execute(sku: string): Promise<SaleStatus> {
    return this.saleRepo.getSaleStatus(SKU.create(sku));
  }
}
