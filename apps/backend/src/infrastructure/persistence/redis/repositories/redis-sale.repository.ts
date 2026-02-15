import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import {
  SaleRepository,
  PurchaseAttemptResult,
  SaleStatus,
} from '@/core/domain/sale/repositories/sale.repository';
import { SKU } from '@/core/domain/sale/value-objects/sku.vo';
import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';
import { UserId } from '@/core/domain/purchase/value-objects/user-id.vo';
import { Sale } from '@/core/domain/sale/entities/sale.entity';
import { PurchaseNumber } from '@/core/domain/purchase/value-objects/purchase-number.vo';
import { REDIS_CLIENT } from '../redis.tokens';

@Injectable()
export class RedisSaleRepository implements SaleRepository, OnModuleInit {
  private readonly logger = new Logger(RedisSaleRepository.name);
  private purchaseScriptSha!: string;
  private transitionScriptSha!: string;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    const luaDir = path.join(__dirname, '../lua-scripts');
    const purchaseLua = fs.readFileSync(path.join(luaDir, 'atomic-purchase.lua'), 'utf-8');
    const transitionLua = fs.readFileSync(path.join(luaDir, 'transition-state.lua'), 'utf-8');
    this.purchaseScriptSha = (await this.redis.script('LOAD', purchaseLua)) as string;
    this.transitionScriptSha = (await this.redis.script('LOAD', transitionLua)) as string;
    this.logger.log('Lua scripts loaded into Redis');
  }

  async attemptPurchase(sku: SKU, userId: UserId): Promise<PurchaseAttemptResult> {
    const id = sku.value;
    const raw = await this.redis.evalsha(
      this.purchaseScriptSha,
      5,
      `sale:${id}:state`,
      `sale:${id}:stock`,
      `sale:${id}:buyers`,
      `sale:${id}:config`,
      `sale:${id}:end_reason`,
      userId.value,
      Date.now().toString(),
    );

    const result = JSON.parse(raw as string) as {
      status: string;
      remainingStock?: number;
      code?: string;
    };

    if (result.status === 'success') {
      const purchaseNo = PurchaseNumber.generate();
      return {
        status: 'success',
        remainingStock: result.remainingStock!,
        purchaseNo: purchaseNo.value,
        purchasedAt: new Date().toISOString(),
      };
    }

    return {
      status: 'rejected',
      code: result.code as 'SALE_NOT_ACTIVE' | 'SOLD_OUT' | 'ALREADY_PURCHASED',
    };
  }

  async getSaleStatus(sku: SKU): Promise<SaleStatus> {
    const id = sku.value;
    const [state, stock, config] = await Promise.all([
      this.redis.get(`sale:${id}:state`),
      this.redis.get(`sale:${id}:stock`),
      this.redis.hgetall(`sale:${id}:config`),
    ]);

    return {
      sku: id,
      state: (state as SaleState) ?? SaleState.UPCOMING,
      stock: parseInt(stock ?? '0', 10),
      initialStock: parseInt(config.initialStock ?? '0', 10),
      productName: config.productName ?? '',
      startTime: config.startTime ?? '',
      endTime: config.endTime ?? '',
    };
  }

  async initializeSale(sale: Sale): Promise<void> {
    const id = sale.sku.value;
    const pipeline = this.redis.pipeline();
    pipeline.set(`sale:${id}:state`, sale.state);
    pipeline.set(`sale:${id}:stock`, sale.stock.value.toString());
    pipeline.del(`sale:${id}:buyers`);
    pipeline.del(`sale:${id}:end_reason`);
    pipeline.hset(`sale:${id}:config`, {
      sku: sale.sku.value,
      productName: sale.productName,
      initialStock: sale.stock.value.toString(),
      startTime: sale.timeRange.start.getTime().toString(),
      endTime: sale.timeRange.end.getTime().toString(),
    });
    await pipeline.exec();
    this.logger.log(`Sale initialized: sku=${id}, stock=${sale.stock.value}`);
  }

  async transitionState(sku: SKU, now: Date): Promise<string> {
    const id = sku.value;
    const result = await this.redis.evalsha(
      this.transitionScriptSha,
      3,
      `sale:${id}:state`,
      `sale:${id}:config`,
      `sale:${id}:end_reason`,
      now.getTime().toString(),
    );
    return result as string;
  }

  async deleteSale(sku: SKU): Promise<void> {
    const id = sku.value;
    await this.redis.del(
      `sale:${id}:state`,
      `sale:${id}:stock`,
      `sale:${id}:buyers`,
      `sale:${id}:config`,
      `sale:${id}:end_reason`,
    );
    this.logger.log(`Sale deleted: sku=${id}`);
  }
}
