import { Inject, Injectable } from '@nestjs/common';
import {
  PURCHASE_REPOSITORY,
  PurchaseRepository,
} from '@/core/domain/sale/repositories/purchase.repository';
import { UserId } from '@/core/domain/purchase/value-objects/user-id.vo';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { Purchase } from '@/core/domain/purchase/entities/purchase.entity';

export interface GetPurchaseStatusQuery {
  userId: string;
  sku: string;
}

@Injectable()
export class GetPurchaseStatusUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY)
    private readonly purchaseRepo: PurchaseRepository,
  ) {}

  async execute(query: GetPurchaseStatusQuery): Promise<Purchase | null> {
    const userId = UserId.create(query.userId);
    const sku = SKU.create(query.sku);

    return this.purchaseRepo.findByUser(sku, userId);
  }
}
