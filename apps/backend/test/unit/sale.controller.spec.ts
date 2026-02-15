import { SaleController } from '../../src/presentation/http/rest/controllers/sale.controller';
import { GetSaleStatusUseCase } from '../../src/application/use-cases/sale/get-sale-status.use-case';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleController', () => {
  let controller: SaleController;
  let mockGetSaleStatus: jest.Mocked<GetSaleStatusUseCase>;
  let mockReply: { header: jest.Mock };

  const saleStatus = {
    sku: 'WIDGET-001',
    state: SaleState.ACTIVE,
    stock: 87,
    initialStock: 100,
    productName: 'Limited Edition Widget',
    startTime: '2026-02-15T10:00:00.000Z',
    endTime: '2026-02-15T10:30:00.000Z',
  };

  beforeEach(() => {
    mockGetSaleStatus = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetSaleStatusUseCase>;

    mockReply = { header: jest.fn().mockReturnThis() };

    controller = new SaleController(mockGetSaleStatus);
  });

  it('should return sale status from use case', async () => {
    mockGetSaleStatus.execute.mockResolvedValue(saleStatus);

    const result = await controller.getStatus({ sku: 'WIDGET-001' }, mockReply as any);

    expect(result).toEqual(saleStatus);
    expect(mockGetSaleStatus.execute).toHaveBeenCalledWith('WIDGET-001');
  });

  it('should set Cache-Control header', async () => {
    mockGetSaleStatus.execute.mockResolvedValue(saleStatus);

    await controller.getStatus({ sku: 'WIDGET-001' }, mockReply as any);

    expect(mockReply.header).toHaveBeenCalledWith('Cache-Control', 'public, max-age=1');
  });

  it('should propagate use case errors', async () => {
    mockGetSaleStatus.execute.mockRejectedValue(new Error('Redis down'));

    await expect(controller.getStatus({ sku: 'WIDGET-001' }, mockReply as any)).rejects.toThrow(
      'Redis down',
    );
  });
});
