import { Module } from '@nestjs/common';
import { SaleController } from './presentation/http/rest/controllers/sale.controller';
import { GetSaleStatusUseCase } from './application/use-cases/sale/get-sale-status.use-case';

@Module({
  controllers: [SaleController],
  providers: [GetSaleStatusUseCase],
})
export class SaleModule {}
