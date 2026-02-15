import { Controller, Get, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { GetSaleStatusUseCase } from '@/application/use-cases/sale/get-sale-status.use-case';
import { SkuQueryDto } from '@/application/dto/sku-query.dto';

@Controller('api/v1/sales')
export class SaleController {
  constructor(private readonly getSaleStatusUseCase: GetSaleStatusUseCase) {}

  @Get()
  async getStatus(@Query() query: SkuQueryDto, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'public, max-age=1');
    return this.getSaleStatusUseCase.execute(query.sku);
  }
}
