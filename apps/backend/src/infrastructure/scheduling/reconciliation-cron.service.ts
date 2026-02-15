import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/infrastructure/persistence/redis/redis.tokens';
import { ReconciliationService } from '@/infrastructure/scheduling/reconciliation.service';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { extractSkuFromKey } from './extract-sku';

@Injectable()
export class ReconciliationCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationCronService.name);
  private cronJob?: CronJob;

  constructor(
    private readonly reconciliationService: ReconciliationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const schedule = this.configService.get<string>('CRON_RECONCILIATION_SCHEDULE', '*/5 * * * *');
    this.cronJob = CronJob.from({
      cronTime: schedule,
      onTick: () => this.handleReconciliation(),
      start: true,
    });
    this.logger.log(`Reconciliation cron started (schedule: ${schedule})`);
  }

  onModuleDestroy(): void {
    this.cronJob?.stop();
  }

  async handleReconciliation(): Promise<void> {
    try {
      const keys = await this.redis.keys('sale:*:state');
      if (keys.length === 0) return;

      for (const key of keys) {
        try {
          const sku = extractSkuFromKey(key);
          if (!sku) continue;

          const status = await this.saleRepo.getSaleStatus(SKU.create(sku));
          if (status.state === SaleState.UPCOMING) continue;

          const result = await this.reconciliationService.reconcile(sku);
          if (result.mismatches > 0) {
            this.logger.warn(
              `Reconciliation found ${result.mismatches} mismatches for SKU: ${sku}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error reconciling key ${key}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in reconciliation cron: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
