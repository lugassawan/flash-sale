import {
  AttemptPurchaseUseCase,
  AttemptPurchaseCommand,
} from '../../../src/application/use-cases/purchase/attempt-purchase.use-case';
import { SaleRepository } from '../../../src/core/domain/sale/repositories/sale.repository';
import { EventPublisher } from '../../../src/application/ports/event-publisher.port';
import { PurchasePersistencePort } from '../../../src/application/ports/purchase-persistence.port';
import { PurchaseConfirmedEvent } from '../../../src/core/domain/sale/events/purchase-confirmed.event';
import { InvalidUserIdError } from '../../../src/core/domain/sale/errors/invalid-user-id.error';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('AttemptPurchaseUseCase', () => {
  let useCase: AttemptPurchaseUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let mockPurchasePersistence: jest.Mocked<PurchasePersistencePort>;

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };
    mockEventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    mockPurchasePersistence = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new AttemptPurchaseUseCase(mockSaleRepo, mockEventPublisher, mockPurchasePersistence);
  });

  const validCommand: AttemptPurchaseCommand = {
    userId: 'alice@test.com',
    sku: 'WIDGET-001',
  };

  describe('successful purchase', () => {
    it('should return success result and publish event', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'success',
        remainingStock: 99,
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });

      const result = await useCase.execute(validCommand);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.remainingStock).toBe(99);
        expect(result.purchaseNo).toBe('PUR-20260215-0001');
      }
    });

    it('should publish PurchaseConfirmedEvent on success', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'success',
        remainingStock: 99,
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });

      await useCase.execute(validCommand);

      expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(expect.any(PurchaseConfirmedEvent));
    });

    it('should enqueue purchase for persistence on success', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'success',
        remainingStock: 99,
        purchaseNo: 'PUR-20260215-0001',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });

      await useCase.execute(validCommand);

      expect(mockPurchasePersistence.enqueue).toHaveBeenCalledTimes(1);
      expect(mockPurchasePersistence.enqueue).toHaveBeenCalledWith({
        purchaseNo: 'PUR-20260215-0001',
        sku: 'WIDGET-001',
        userId: 'alice@test.com',
        purchasedAt: '2026-02-15T10:00:01.234Z',
      });
    });
  });

  describe('rejected purchase', () => {
    it('should reject when sale is not active', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'rejected',
        code: 'SALE_NOT_ACTIVE',
      });

      const result = await useCase.execute(validCommand);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('SALE_NOT_ACTIVE');
      }
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
      expect(mockPurchasePersistence.enqueue).not.toHaveBeenCalled();
    });

    it('should reject when sold out', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'rejected',
        code: 'SOLD_OUT',
      });

      const result = await useCase.execute(validCommand);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('SOLD_OUT');
      }
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
      expect(mockPurchasePersistence.enqueue).not.toHaveBeenCalled();
    });

    it('should reject duplicate purchase', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'rejected',
        code: 'ALREADY_PURCHASED',
      });

      const result = await useCase.execute(validCommand);

      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.code).toBe('ALREADY_PURCHASED');
      }
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
      expect(mockPurchasePersistence.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('should throw on empty userId', async () => {
      await expect(useCase.execute({ userId: '   ', sku: 'WIDGET-001' })).rejects.toThrow(
        InvalidUserIdError,
      );
    });

    it('should throw on invalid SKU', async () => {
      await expect(
        useCase.execute({ userId: 'alice@test.com', sku: 'invalid sku!' }),
      ).rejects.toThrow(InvalidSKUError);
    });

    it('should not call repository when input validation fails', async () => {
      await expect(useCase.execute({ userId: '', sku: 'WIDGET-001' })).rejects.toThrow();

      expect(mockSaleRepo.attemptPurchase).not.toHaveBeenCalled();
    });
  });

  describe('delegation', () => {
    it('should delegate to SaleRepository with domain value objects', async () => {
      mockSaleRepo.attemptPurchase.mockResolvedValue({
        status: 'rejected',
        code: 'SOLD_OUT',
      });

      await useCase.execute(validCommand);

      expect(mockSaleRepo.attemptPurchase).toHaveBeenCalledTimes(1);
      const [skuArg, userIdArg] = mockSaleRepo.attemptPurchase.mock.calls[0];
      expect(skuArg.value).toBe('WIDGET-001');
      expect(userIdArg.value).toBe('alice@test.com');
    });
  });
});
