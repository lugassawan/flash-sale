import { Module } from '@nestjs/common';
import { ProductController } from './presentation/http/rest/controllers/product.controller';
import { CreateSaleUseCase } from './application/use-cases/sale/create-sale.use-case';
import { GetSaleStatusUseCase } from './application/use-cases/sale/get-sale-status.use-case';
import { UpdateSaleUseCase } from './application/use-cases/sale/update-sale.use-case';
import { DeleteSaleUseCase } from './application/use-cases/sale/delete-sale.use-case';

@Module({
  controllers: [ProductController],
  providers: [CreateSaleUseCase, GetSaleStatusUseCase, UpdateSaleUseCase, DeleteSaleUseCase],
})
export class ProductModule {}
