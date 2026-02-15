import { UpdateSaleUseCase } from '../../../src/application/use-cases/sale/update-sale.use-case';
import {
  SaleRepository,
  SaleStatus,
} from '../../../src/core/domain/sale/repositories/sale.repository';
import { SaleState } from '../../../src/core/domain/sale/value-objects/sale-state.vo';
import { ValidationError } from '../../../src/application/errors/application.error';

describe('UpdateSaleUseCase', () => {
  let useCase: UpdateSaleUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;

  const upcomingStatus: SaleStatus = {
    sku: 'WIDGET-001',
    state: SaleState.UPCOMING,
    stock: 100,
    initialStock: 100,
    productName: 'Test Widget',
    startTime: '2026-02-16T09:00:00Z',
    endTime: '2026-02-16T11:00:00Z',
  };

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn().mockResolvedValue(upcomingStatus),
      initializeSale: jest.fn().mockResolvedValue(undefined),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };
    useCase = new UpdateSaleUseCase(mockSaleRepo);
  });

  it('should update sale when in UPCOMING state', async () => {
    await useCase.execute({
      sku: 'WIDGET-001',
      productName: 'Updated Widget',
    });

    expect(mockSaleRepo.initializeSale).toHaveBeenCalledTimes(1);
    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.productName).toBe('Updated Widget');
  });

  it('should reject update when sale is ACTIVE', async () => {
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      ...upcomingStatus,
      state: SaleState.ACTIVE,
    });

    await expect(useCase.execute({ sku: 'WIDGET-001', productName: 'Updated' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('should reject update when sale is ENDED', async () => {
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      ...upcomingStatus,
      state: SaleState.ENDED,
    });

    await expect(useCase.execute({ sku: 'WIDGET-001', productName: 'Updated' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('should preserve existing fields when not provided', async () => {
    await useCase.execute({
      sku: 'WIDGET-001',
      productName: 'Updated Widget',
    });

    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.stock.value).toBe(100);
  });

  it('should update stock when provided', async () => {
    await useCase.execute({
      sku: 'WIDGET-001',
      initialStock: 200,
    });

    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.stock.value).toBe(200);
  });

  it('should update time range when provided', async () => {
    await useCase.execute({
      sku: 'WIDGET-001',
      startTime: '2026-02-17T09:00:00Z',
      endTime: '2026-02-17T11:00:00Z',
    });

    const [saleArg] = mockSaleRepo.initializeSale.mock.calls[0];
    expect(saleArg.timeRange.start).toEqual(new Date('2026-02-17T09:00:00Z'));
    expect(saleArg.timeRange.end).toEqual(new Date('2026-02-17T11:00:00Z'));
  });

  it('should include state info in validation error', async () => {
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      ...upcomingStatus,
      state: SaleState.ACTIVE,
    });

    try {
      await useCase.execute({ sku: 'WIDGET-001', productName: 'Updated' });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fields?.state).toContain('ACTIVE');
    }
  });
});
