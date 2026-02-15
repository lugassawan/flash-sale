import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AttemptPurchaseUseCase } from '@/application/use-cases/purchase/attempt-purchase.use-case';
import { GetPurchaseStatusUseCase } from '@/application/use-cases/purchase/get-purchase-status.use-case';
import { AttemptPurchaseDto } from '@/application/dto/attempt-purchase.dto';
import { SkuQueryDto } from '@/application/dto/sku-query.dto';
import { NotFoundError } from '@/application/errors/application.error';
import { PurchaseAttemptResult } from '@/core/domain/sale/repositories/sale.repository';
import { UserId } from '@/presentation/http/rest/decorators/user-id.decorator';

type RejectionCode = Extract<PurchaseAttemptResult, { status: 'rejected' }>['code'];

@Controller('api/v1/purchases')
export class PurchaseController {
  constructor(
    private readonly attemptPurchaseUseCase: AttemptPurchaseUseCase,
    private readonly getPurchaseStatusUseCase: GetPurchaseStatusUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  async purchase(@UserId() userId: string, @Body() dto: AttemptPurchaseDto) {
    const result = await this.attemptPurchaseUseCase.execute({ userId, sku: dto.sku });

    if (result.status === 'rejected') {
      return {
        success: false,
        error: { code: result.code, message: rejectionMessage(result.code) },
      };
    }

    return { purchaseNo: result.purchaseNo, purchasedAt: result.purchasedAt };
  }

  @Get()
  async getStatus(@UserId() userId: string, @Query() query: SkuQueryDto) {
    const purchase = await this.getPurchaseStatusUseCase.execute({ userId, sku: query.sku });

    if (!purchase) {
      throw new NotFoundError('No purchase found for this user.');
    }

    return {
      purchaseNo: purchase.purchaseNo.value,
      purchasedAt: purchase.purchasedAt.toISOString(),
    };
  }
}

const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  SALE_NOT_ACTIVE: 'Sale is not currently active.',
  SOLD_OUT: 'Sorry, all items have been sold.',
  ALREADY_PURCHASED: 'You have already purchased this item.',
};

function rejectionMessage(code: RejectionCode): string {
  return REJECTION_MESSAGES[code];
}
