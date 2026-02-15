import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REDIS_CLIENT } from '@/infrastructure/persistence/redis/redis.module';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import {
  PurchasePersistencePort,
  PURCHASE_PERSISTENCE,
} from '@/application/ports/purchase-persistence.port';
import { MetricsService } from '@/infrastructure/observability/metrics.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(PurchaseOrmEntity)
    private readonly purchaseRepo: Repository<PurchaseOrmEntity>,
    @InjectRepository(ProductOrmEntity)
    private readonly productRepo: Repository<ProductOrmEntity>,
    @Inject(PURCHASE_PERSISTENCE)
    private readonly purchasePersistence: PurchasePersistencePort,
    private readonly metrics: MetricsService,
  ) {}

  async reconcile(sku: string): Promise<{ mismatches: number }> {
    this.logger.log(`Starting reconciliation for SKU: ${sku}`);

    const product = await this.productRepo.findOne({ where: { sku } });
    if (!product) {
      this.logger.warn(`Product not found for SKU: ${sku}, skipping reconciliation`);
      return { mismatches: 0 };
    }

    const redisBuyers = await this.redis.smembers(`sale:${sku}:buyers`);
    if (redisBuyers.length === 0) {
      this.logger.log(`No buyers in Redis for SKU: ${sku}`);
      return { mismatches: 0 };
    }

    const pgPurchases = await this.purchaseRepo.find({
      where: { productId: product.id },
      select: ['userId'],
    });
    const pgUserIds = new Set(pgPurchases.map((p) => p.userId));

    const missingUserIds = redisBuyers.filter((userId) => !pgUserIds.has(userId));

    if (missingUserIds.length === 0) {
      this.logger.log(`Reconciliation complete for SKU: ${sku} — no mismatches`);
      return { mismatches: 0 };
    }

    this.logger.warn(`Reconciliation found ${missingUserIds.length} mismatches for SKU: ${sku}`);
    this.metrics.reconciliationMismatches.inc(missingUserIds.length);

    // Re-enqueue missing purchases. purchasedAt uses reconciliation time since
    // Redis only stores user IDs in the buyers set, not individual purchase timestamps.
    // The RECON- prefix in purchaseNo identifies records created via reconciliation.
    for (const userId of missingUserIds) {
      await this.purchasePersistence.enqueue({
        purchaseNo: `RECON-${Date.now()}-${userId}`,
        sku,
        userId,
        purchasedAt: new Date().toISOString(),
      });
    }

    this.logger.log(
      `Reconciliation re-enqueued ${missingUserIds.length} purchases for SKU: ${sku}`,
    );

    return { mismatches: missingUserIds.length };
  }
}
