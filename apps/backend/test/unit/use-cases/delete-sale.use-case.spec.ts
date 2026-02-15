import { DeleteSaleUseCase } from '../../../src/application/use-cases/sale/delete-sale.use-case';
import { SaleRepository } from '../../../src/core/domain/sale/repositories/sale.repository';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('DeleteSaleUseCase', () => {
  let useCase: DeleteSaleUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new DeleteSaleUseCase(mockSaleRepo);
  });

  it('should delete sale via repository', async () => {
    await useCase.execute('WIDGET-001');

    expect(mockSaleRepo.deleteSale).toHaveBeenCalledTimes(1);
    const [skuArg] = mockSaleRepo.deleteSale.mock.calls[0];
    expect(skuArg.value).toBe('WIDGET-001');
  });

  it('should throw on invalid SKU', async () => {
    await expect(useCase.execute('bad sku!')).rejects.toThrow(InvalidSKUError);
    expect(mockSaleRepo.deleteSale).not.toHaveBeenCalled();
  });
});
