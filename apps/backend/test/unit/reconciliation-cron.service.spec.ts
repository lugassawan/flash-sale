import { ConfigService } from '@nestjs/config';
import { ReconciliationCronService } from '../../src/infrastructure/scheduling/reconciliation-cron.service';
import { ReconciliationService } from '../../src/infrastructure/scheduling/reconciliation.service';
import {
  SaleRepository,
  SaleStatus,
} from '../../src/core/domain/sale/repositories/sale.repository';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('ReconciliationCronService', () => {
  let service: ReconciliationCronService;
  let mockReconciliation: jest.Mocked<ReconciliationService>;
  let mockRedis: { keys: jest.Mock };
  let mockSaleRepo: jest.Mocked<SaleRepository>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const buildSaleStatus = (overrides: Partial<SaleStatus> = {}): SaleStatus => ({
    sku: 'WIDGET-001',
    state: SaleState.ACTIVE,
    stock: 50,
    initialStock: 100,
    productName: 'Test Widget',
    startTime: '2026-02-15T09:00:00Z',
    endTime: '2026-02-15T11:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    mockReconciliation = {
      reconcile: jest.fn().mockResolvedValue({ mismatches: 0 }),
    } as any;

    mockRedis = {
      keys: jest.fn().mockResolvedValue([]),
    };

    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('*/5 * * * *'),
    } as any;

    service = new ReconciliationCronService(
      mockReconciliation,
      mockRedis as any,
      mockSaleRepo,
      mockConfigService,
    );
  });

  it('should reconcile active sales', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue(buildSaleStatus({ state: SaleState.ACTIVE }));
    mockReconciliation.reconcile.mockResolvedValue({ mismatches: 2 });

    await service.handleReconciliation();

    expect(mockRedis.keys).toHaveBeenCalledWith('sale:*:state');
    expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
    expect(mockSaleRepo.getSaleStatus.mock.calls[0][0].value).toBe('WIDGET-001');
    expect(mockReconciliation.reconcile).toHaveBeenCalledWith('WIDGET-001');
  });

  it('should skip when no sales exist', async () => {
    mockRedis.keys.mockResolvedValue([]);

    await service.handleReconciliation();

    expect(mockSaleRepo.getSaleStatus).not.toHaveBeenCalled();
    expect(mockReconciliation.reconcile).not.toHaveBeenCalled();
  });

  it('should reconcile ENDED sales too (final reconciliation)', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue(buildSaleStatus({ state: SaleState.ENDED }));
    mockReconciliation.reconcile.mockResolvedValue({ mismatches: 1 });

    await service.handleReconciliation();

    expect(mockReconciliation.reconcile).toHaveBeenCalledWith('WIDGET-001');
  });

  it('should skip UPCOMING sales', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue(buildSaleStatus({ state: SaleState.UPCOMING }));

    await service.handleReconciliation();

    expect(mockReconciliation.reconcile).not.toHaveBeenCalled();
  });

  it('should not throw when reconciliation errors', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue(buildSaleStatus({ state: SaleState.ACTIVE }));
    mockReconciliation.reconcile.mockRejectedValue(new Error('Redis connection lost'));

    await expect(service.handleReconciliation()).resolves.not.toThrow();
  });

  it('should not throw when redis.keys errors', async () => {
    mockRedis.keys.mockRejectedValue(new Error('Redis timeout'));

    await expect(service.handleReconciliation()).resolves.not.toThrow();
  });

  it('should process multiple sales independently', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state', 'sale:GADGET-002:state']);
    mockSaleRepo.getSaleStatus
      .mockResolvedValueOnce(buildSaleStatus({ sku: 'WIDGET-001', state: SaleState.ACTIVE }))
      .mockResolvedValueOnce(buildSaleStatus({ sku: 'GADGET-002', state: SaleState.UPCOMING }));

    await service.handleReconciliation();

    expect(mockReconciliation.reconcile).toHaveBeenCalledTimes(1);
    expect(mockReconciliation.reconcile).toHaveBeenCalledWith('WIDGET-001');
  });
});
