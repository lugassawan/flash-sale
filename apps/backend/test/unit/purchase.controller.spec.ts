import { PurchaseController } from '../../src/presentation/http/rest/controllers/purchase.controller';
import { AttemptPurchaseUseCase } from '../../src/application/use-cases/purchase/attempt-purchase.use-case';
import { GetPurchaseStatusUseCase } from '../../src/application/use-cases/purchase/get-purchase-status.use-case';
import { NotFoundError } from '../../src/application/errors/application.error';
import { Purchase } from '../../src/core/domain/purchase/entities/purchase.entity';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service';

const createMockMetrics = () =>
  ({
    purchaseOutcomeTotal: { inc: jest.fn() },
  }) as unknown as MetricsService;

describe('PurchaseController', () => {
  let controller: PurchaseController;
  let mockAttemptPurchase: jest.Mocked<AttemptPurchaseUseCase>;
  let mockGetPurchaseStatus: jest.Mocked<GetPurchaseStatusUseCase>;
  let mockMetrics: MetricsService;

  beforeEach(() => {
    mockAttemptPurchase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AttemptPurchaseUseCase>;

    mockGetPurchaseStatus = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetPurchaseStatusUseCase>;

    mockMetrics = createMockMetrics();

    controller = new PurchaseController(mockAttemptPurchase, mockGetPurchaseStatus, mockMetrics);
  });

  describe('POST /api/v1/purchases', () => {
    const userId = 'alice@test.com';
    const dto = { sku: 'WIDGET-001' };

    it('should return purchase data on success', async () => {
      mockAttemptPurchase.execute.mockResolvedValue({
        status: 'success',
        remainingStock: 99,
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });

      const result = await controller.purchase(userId, dto);

      expect(result).toEqual({
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });
      expect(mockAttemptPurchase.execute).toHaveBeenCalledWith({ userId, sku: 'WIDGET-001' });
    });

    it('should return error envelope when sale is not active', async () => {
      mockAttemptPurchase.execute.mockResolvedValue({
        status: 'rejected',
        code: 'SALE_NOT_ACTIVE',
      });

      const result = await controller.purchase(userId, dto);

      expect(result).toEqual({
        success: false,
        error: { code: 'SALE_NOT_ACTIVE', message: 'Sale is not currently active.' },
      });
    });

    it('should return error envelope when sold out', async () => {
      mockAttemptPurchase.execute.mockResolvedValue({
        status: 'rejected',
        code: 'SOLD_OUT',
      });

      const result = await controller.purchase(userId, dto);

      expect(result).toEqual({
        success: false,
        error: { code: 'SOLD_OUT', message: 'Sorry, all items have been sold.' },
      });
    });

    it('should return error envelope when already purchased', async () => {
      mockAttemptPurchase.execute.mockResolvedValue({
        status: 'rejected',
        code: 'ALREADY_PURCHASED',
      });

      const result = await controller.purchase(userId, dto);

      expect(result).toEqual({
        success: false,
        error: { code: 'ALREADY_PURCHASED', message: 'You have already purchased this item.' },
      });
    });
  });

  describe('GET /api/v1/purchases', () => {
    const userId = 'alice@test.com';
    const query = { sku: 'WIDGET-001' };

    it('should return purchase when found', async () => {
      const purchase = Purchase.reconstitute({
        purchaseNo: 'PUR-20260215-0001',
        sku: 'WIDGET-001',
        userId: 'alice@test.com',
        purchasedAt: new Date('2026-02-15T10:00:01.234Z'),
      });
      mockGetPurchaseStatus.execute.mockResolvedValue(purchase);

      const result = await controller.getStatus(userId, query);

      expect(result).toEqual({
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });
      expect(mockGetPurchaseStatus.execute).toHaveBeenCalledWith({
        userId,
        sku: 'WIDGET-001',
      });
    });

    it('should throw NotFoundError when no purchase exists', async () => {
      mockGetPurchaseStatus.execute.mockResolvedValue(null);

      await expect(controller.getStatus(userId, query)).rejects.toThrow(NotFoundError);
      await expect(controller.getStatus(userId, query)).rejects.toThrow(
        'No purchase found for this user.',
      );
    });
  });
});
