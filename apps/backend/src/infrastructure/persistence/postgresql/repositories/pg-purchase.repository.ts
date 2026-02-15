import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrmEntity } from '../entities/purchase.orm-entity';
import { ProductOrmEntity } from '../entities/product.orm-entity';
import { PurchaseRepository } from '@/core/domain/sale/repositories/purchase.repository';
import { Purchase } from '@/core/domain/purchase/entities/purchase.entity';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { UserId } from '@/core/domain/purchase/value-objects/user-id.vo';

@Injectable()
export class PgPurchaseRepository implements PurchaseRepository {
  private readonly logger = new Logger(PgPurchaseRepository.name);

  constructor(
    @InjectRepository(PurchaseOrmEntity)
    private readonly purchaseRepo: Repository<PurchaseOrmEntity>,
    @InjectRepository(ProductOrmEntity)
    private readonly productRepo: Repository<ProductOrmEntity>,
  ) {}

  async persist(purchase: Purchase): Promise<void> {
    const product = await this.productRepo.findOne({
      where: { sku: purchase.sku.value },
    });

    if (!product) {
      this.logger.warn(`Product not found for SKU: ${purchase.sku.value}, skipping persist`);
      return;
    }

    await this.purchaseRepo
      .createQueryBuilder()
      .insert()
      .into(PurchaseOrmEntity)
      .values({
        productId: product.id,
        userId: purchase.userId.value,
        purchasedAt: purchase.purchasedAt,
        createdBy: 'system',
      })
      .orIgnore()
      .execute();

    this.logger.log(
      `Purchase persist attempted (idempotent): user=${purchase.userId.value}, sku=${purchase.sku.value}`,
    );
  }

  async findByUser(sku: SKU, userId: UserId): Promise<Purchase | null> {
    const result = await this.purchaseRepo
      .createQueryBuilder('purchase')
      .innerJoin('purchase.product', 'product')
      .where('product.sku = :sku', { sku: sku.value })
      .andWhere('purchase.userId = :userId', { userId: userId.value })
      .getOne();

    if (!result) {
      return null;
    }

    return Purchase.reconstitute({
      purchaseNo: `PUR-${result.id}`,
      sku: sku.value,
      userId: result.userId,
      purchasedAt: result.purchasedAt,
    });
  }
}
