import { GetSaleStatusUseCase } from '../../../src/application/use-cases/sale/get-sale-status.use-case';
import {
  SaleRepository,
  SaleStatus,
} from '../../../src/core/domain/sale/repositories/sale.repository';
import { SaleState } from '../../../src/core/domain/sale/value-objects/sale-state.vo';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('GetSaleStatusUseCase', () => {
  let useCase: GetSaleStatusUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };
    useCase = new GetSaleStatusUseCase(mockSaleRepo);
  });

  it('should return sale status for valid SKU', async () => {
    const expectedStatus: SaleStatus = {
      sku: 'WIDGET-001',
      state: SaleState.ACTIVE,
      stock: 50,
      initialStock: 100,
      productName: 'Test Widget',
      startTime: '2026-02-15T09:00:00Z',
      endTime: '2026-02-15T11:00:00Z',
    };
    mockSaleRepo.getSaleStatus.mockResolvedValue(expectedStatus);

    const result = await useCase.execute('WIDGET-001');

    expect(result).toEqual(expectedStatus);
  });

  it('should delegate to SaleRepository with SKU value object', async () => {
    const status: SaleStatus = {
      sku: 'WIDGET-001',
      state: SaleState.UPCOMING,
      stock: 100,
      initialStock: 100,
      productName: 'Test Widget',
      startTime: '2026-02-15T09:00:00Z',
      endTime: '2026-02-15T11:00:00Z',
    };
    mockSaleRepo.getSaleStatus.mockResolvedValue(status);

    await useCase.execute('WIDGET-001');

    expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
    const [skuArg] = mockSaleRepo.getSaleStatus.mock.calls[0];
    expect(skuArg.value).toBe('WIDGET-001');
  });

  it('should throw on invalid SKU', async () => {
    await expect(useCase.execute('bad sku!')).rejects.toThrow(InvalidSKUError);
  });

  it('should return ENDED state status', async () => {
    const status: SaleStatus = {
      sku: 'WIDGET-001',
      state: SaleState.ENDED,
      stock: 0,
      initialStock: 100,
      productName: 'Test Widget',
      startTime: '2026-02-15T09:00:00Z',
      endTime: '2026-02-15T11:00:00Z',
    };
    mockSaleRepo.getSaleStatus.mockResolvedValue(status);

    const result = await useCase.execute('WIDGET-001');

    expect(result.state).toBe(SaleState.ENDED);
    expect(result.stock).toBe(0);
  });
});
