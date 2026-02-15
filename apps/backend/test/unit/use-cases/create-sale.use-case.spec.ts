import { CreateSaleUseCase } from '../../../src/application/use-cases/sale/create-sale.use-case';
import { SaleRepository } from '../../../src/core/domain/sale/repositories/sale.repository';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';
import { InvalidStockError } from '../../../src/core/domain/sale/errors/invalid-stock.error';
import { InvalidTimeRangeError } from '../../../src/core/domain/sale/errors/invalid-time-range.error';

describe('CreateSaleUseCase', () => {
  let useCase: CreateSaleUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn().mockResolvedValue(undefined),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };
    useCase = new CreateSaleUseCase(mockSaleRepo);
  });

  const validCommand = {
    sku: 'WIDGET-001',
    productName: 'Test Widget',
    initialStock: 100,
    startTime: '2026-02-16T09:00:00Z',
    endTime: '2026-02-16T11:00:00Z',
  };

  it('should create sale and initialize in repository', async () => {
    await useCase.execute(validCommand);

    expect(mockSaleRepo.initializeSale).toHaveBeenCalledTimes(1);
    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.sku.value).toBe('WIDGET-001');
    expect(saleArg.productName).toBe('Test Widget');
    expect(saleArg.stock.value).toBe(100);
  });

  it('should validate SKU via Sale.create()', async () => {
    await expect(useCase.execute({ ...validCommand, sku: 'bad sku!' })).rejects.toThrow(
      InvalidSKUError,
    );

    expect(mockSaleRepo.initializeSale).not.toHaveBeenCalled();
  });

  it('should validate stock via Sale.create()', async () => {
    await expect(useCase.execute({ ...validCommand, initialStock: -1 })).rejects.toThrow(
      InvalidStockError,
    );

    expect(mockSaleRepo.initializeSale).not.toHaveBeenCalled();
  });

  it('should validate time range via Sale.create()', async () => {
    await expect(
      useCase.execute({
        ...validCommand,
        startTime: '2026-02-16T11:00:00Z',
        endTime: '2026-02-16T09:00:00Z',
      }),
    ).rejects.toThrow(InvalidTimeRangeError);

    expect(mockSaleRepo.initializeSale).not.toHaveBeenCalled();
  });

  it('should allow zero stock', async () => {
    await useCase.execute({ ...validCommand, initialStock: 0 });

    expect(mockSaleRepo.initializeSale).toHaveBeenCalledTimes(1);
    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.stock.value).toBe(0);
  });
});
