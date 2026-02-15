import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ProductOrmEntity } from './entities/product.orm-entity';
import { PurchaseOrmEntity } from './entities/purchase.orm-entity';
import { PgProductRepository } from './repositories/pg-product.repository';
import { PgPurchaseRepository } from './repositories/pg-purchase.repository';
import { CircuitBreaker } from './circuit-breaker';
import { PURCHASE_REPOSITORY } from '@/core/domain/sale/repositories/purchase.repository';
import { DATA_SOURCE } from '@/presentation/http/rest/controllers/health.controller';

export const PG_PRODUCT_REPOSITORY = Symbol('PG_PRODUCT_REPOSITORY');

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [ProductOrmEntity, PurchaseOrmEntity],
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([ProductOrmEntity, PurchaseOrmEntity]),
  ],
  providers: [
    {
      provide: CircuitBreaker,
      useFactory: () => new CircuitBreaker(5, 30_000),
    },
    PgProductRepository,
    PgPurchaseRepository,
    {
      provide: PURCHASE_REPOSITORY,
      useExisting: PgPurchaseRepository,
    },
    {
      provide: PG_PRODUCT_REPOSITORY,
      useExisting: PgProductRepository,
    },
    {
      provide: DATA_SOURCE,
      useFactory: (dataSource: DataSource) => dataSource,
      inject: [DataSource],
    },
  ],
  exports: [
    PURCHASE_REPOSITORY,
    PG_PRODUCT_REPOSITORY,
    PgProductRepository,
    PgPurchaseRepository,
    CircuitBreaker,
    DATA_SOURCE,
  ],
})
export class PostgresqlModule {}
