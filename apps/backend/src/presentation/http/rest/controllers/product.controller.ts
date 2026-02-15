import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../guards/admin-key.guard';
import { CreateSaleUseCase } from '@/application/use-cases/sale/create-sale.use-case';
import { GetSaleStatusUseCase } from '@/application/use-cases/sale/get-sale-status.use-case';
import { UpdateSaleUseCase } from '@/application/use-cases/sale/update-sale.use-case';
import { DeleteSaleUseCase } from '@/application/use-cases/sale/delete-sale.use-case';
import { PgProductRepository } from '@/infrastructure/persistence/postgresql/repositories/pg-product.repository';
import { PG_PRODUCT_REPOSITORY } from '@/infrastructure/persistence/postgresql/postgresql.module';
import { CreateSaleDto } from '@/application/dto/create-sale.dto';
import { UpdateSaleDto } from '@/application/dto/update-sale.dto';
import {
  AdminProductResponseDto,
  AdminProductDetailResponseDto,
} from '@/application/dto/admin-product-response.dto';
import { NotFoundError } from '@/application/errors/application.error';
import { SaleState } from '@/core/domain/sale/value-objects/sale-state.vo';
import { parseRedisTimestamp } from '@/shared/parse-redis-timestamp';

@Controller('api/v1/products')
@UseGuards(AdminKeyGuard)
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly createSaleUseCase: CreateSaleUseCase,
    private readonly getSaleStatusUseCase: GetSaleStatusUseCase,
    private readonly updateSaleUseCase: UpdateSaleUseCase,
    private readonly deleteSaleUseCase: DeleteSaleUseCase,
    @Inject(PG_PRODUCT_REPOSITORY) private readonly pgProductRepo: PgProductRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSaleDto): Promise<AdminProductResponseDto> {
    await this.createSaleUseCase.execute(dto);

    await this.pgProductRepo.upsertBySku({
      sku: dto.sku,
      productName: dto.productName,
      initialStock: dto.initialStock,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      state: SaleState.UPCOMING,
      createdBy: 'admin',
    });

    const product = await this.pgProductRepo.findBySku(dto.sku);

    return AdminProductResponseDto.from({
      sku: dto.sku,
      productName: dto.productName,
      initialStock: dto.initialStock,
      startTime: dto.startTime,
      endTime: dto.endTime,
      state: SaleState.UPCOMING,
      createdAt: product?.createdAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  @Get(':sku')
  async findOne(@Param('sku') sku: string): Promise<AdminProductDetailResponseDto> {
    const [saleStatus, product] = await Promise.all([
      this.getSaleStatusUseCase.execute(sku),
      this.pgProductRepo.findBySku(sku),
    ]);

    if (!product && saleStatus.initialStock === 0 && !saleStatus.productName) {
      throw new NotFoundError(`Product with SKU '${sku}' not found`);
    }

    const totalPurchases = saleStatus.initialStock - saleStatus.stock;

    const startTimeIso = saleStatus.startTime
      ? parseRedisTimestamp(saleStatus.startTime).toISOString()
      : (product?.startTime?.toISOString() ?? '');
    const endTimeIso = saleStatus.endTime
      ? parseRedisTimestamp(saleStatus.endTime).toISOString()
      : (product?.endTime?.toISOString() ?? '');

    return AdminProductDetailResponseDto.fromDetail({
      sku: saleStatus.sku,
      productName: saleStatus.productName || product?.productName || '',
      initialStock: saleStatus.initialStock,
      currentStock: saleStatus.stock,
      startTime: startTimeIso,
      endTime: endTimeIso,
      state: saleStatus.state,
      totalPurchases,
      createdAt: product?.createdAt?.toISOString() ?? '',
    });
  }

  @Put(':sku')
  async update(
    @Param('sku') sku: string,
    @Body() dto: UpdateSaleDto,
  ): Promise<AdminProductResponseDto> {
    await this.updateSaleUseCase.execute({ sku, ...dto });

    const saleStatus = await this.getSaleStatusUseCase.execute(sku);

    const startTime = parseRedisTimestamp(saleStatus.startTime);
    const endTime = parseRedisTimestamp(saleStatus.endTime);

    await this.pgProductRepo.upsertBySku({
      sku,
      productName: saleStatus.productName,
      initialStock: saleStatus.initialStock,
      startTime,
      endTime,
      state: saleStatus.state,
      createdBy: 'admin',
      updatedBy: 'admin',
      updatedAt: new Date(),
    });

    const product = await this.pgProductRepo.findBySku(sku);

    return AdminProductResponseDto.from({
      sku: saleStatus.sku,
      productName: saleStatus.productName,
      initialStock: saleStatus.initialStock,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      state: saleStatus.state,
      createdAt: product?.createdAt?.toISOString() ?? '',
    });
  }

  @Delete(':sku')
  async remove(@Param('sku') sku: string): Promise<{ message: string }> {
    this.logger.warn(`Deleting product and all sale data: sku=${sku}`);

    await Promise.all([this.deleteSaleUseCase.execute(sku), this.pgProductRepo.deleteBySku(sku)]);

    return { message: `Product ${sku} and all associated sale data have been reset.` };
  }
}
