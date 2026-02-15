import { GetPurchaseStatusUseCase } from '../../../src/application/use-cases/purchase/get-purchase-status.use-case';
import { PurchaseRepository } from '../../../src/core/domain/sale/repositories/purchase.repository';
import { Purchase } from '../../../src/core/domain/purchase/entities/purchase.entity';
import { InvalidUserIdError } from '../../../src/core/domain/sale/errors/invalid-user-id.error';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('GetPurchaseStatusUseCase', () => {
  let useCase: GetPurchaseStatusUseCase;
  let mockPurchaseRepo: jest.Mocked<PurchaseRepository>;

  beforeEach(() => {
    mockPurchaseRepo = {
      findByUser: jest.fn(),
      persist: jest.fn(),
    };
    useCase = new GetPurchaseStatusUseCase(mockPurchaseRepo);
  });

  it('should return purchase when found', async () => {
    const purchase = Purchase.reconstitute({
      purchaseNo: 'PUR-20260215-0001',
      sku: 'WIDGET-001',
      userId: 'alice@test.com',
      purchasedAt: new Date('2026-02-15T10:00:00Z'),
    });
    mockPurchaseRepo.findByUser.mockResolvedValue(purchase);

    const result = await useCase.execute({
      userId: 'alice@test.com',
      sku: 'WIDGET-001',
    });

    expect(result).toBeDefined();
    expect(result!.purchaseNo.value).toBe('PUR-20260215-0001');
    expect(result!.userId.value).toBe('alice@test.com');
  });

  it('should return null when no purchase found', async () => {
    mockPurchaseRepo.findByUser.mockResolvedValue(null);

    const result = await useCase.execute({
      userId: 'alice@test.com',
      sku: 'WIDGET-001',
    });

    expect(result).toBeNull();
  });

  it('should delegate with domain value objects', async () => {
    mockPurchaseRepo.findByUser.mockResolvedValue(null);

    await useCase.execute({ userId: 'alice@test.com', sku: 'WIDGET-001' });

    expect(mockPurchaseRepo.findByUser).toHaveBeenCalledTimes(1);
    const [skuArg, userIdArg] = mockPurchaseRepo.findByUser.mock.calls[0];
    expect(skuArg.value).toBe('WIDGET-001');
    expect(userIdArg.value).toBe('alice@test.com');
  });

  it('should throw on empty userId', async () => {
    await expect(useCase.execute({ userId: '', sku: 'WIDGET-001' })).rejects.toThrow(
      InvalidUserIdError,
    );
  });

  it('should throw on invalid SKU', async () => {
    await expect(useCase.execute({ userId: 'alice@test.com', sku: 'bad sku!' })).rejects.toThrow(
      InvalidSKUError,
    );
  });
});
