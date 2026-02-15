import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/infrastructure/persistence/redis/redis.module';
import { TransitionSaleStateUseCase } from '@/application/use-cases/sale/transition-sale-state.use-case';
import { SALE_REPOSITORY, SaleRepository } from '@/core/domain/sale/repositories/sale.repository';
import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { extractSkuFromKey } from './extract-sku';

@Injectable()
export class SaleStateCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SaleStateCronService.name);
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly transitionUseCase: TransitionSaleStateUseCase,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SALE_REPOSITORY) private readonly saleRepo: SaleRepository,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const ms = this.configService.get<number>('CRON_STATE_INTERVAL_MS', 100);
    this.intervalHandle = setInterval(() => this.handleStateTransitions(), ms);
    this.logger.log(`State transition cron started (interval: ${ms}ms)`);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  async handleStateTransitions(): Promise<void> {
    try {
      const keys = await this.redis.keys('sale:*:state');
      if (keys.length === 0) return;

      for (const key of keys) {
        try {
          const sku = extractSkuFromKey(key);
          if (!sku) continue;

          const status = await this.saleRepo.getSaleStatus(SKU.create(sku));
          if (status.state === SaleState.ENDED) continue;

          await this.transitionUseCase.execute(sku);
        } catch (error) {
          this.logger.error(
            `Error processing key ${key}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in state transition cron: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
