import { ConfigService } from '@nestjs/config';
import { SaleStateCronService } from '../../src/infrastructure/scheduling/sale-state-cron.service';
import { TransitionSaleStateUseCase } from '../../src/application/use-cases/sale/transition-sale-state.use-case';
import { SaleRepository } from '../../src/core/domain/sale/repositories/sale.repository';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleStateCronService', () => {
  let service: SaleStateCronService;
  let mockTransitionUseCase: jest.Mocked<TransitionSaleStateUseCase>;
  let mockRedis: { keys: jest.Mock };
  let mockSaleRepo: jest.Mocked<SaleRepository>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockTransitionUseCase = {
      execute: jest.fn().mockResolvedValue('ACTIVE'),
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
      get: jest.fn().mockReturnValue(100),
    } as any;

    service = new SaleStateCronService(
      mockTransitionUseCase,
      mockRedis as any,
      mockSaleRepo,
      mockConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should do nothing when no sale keys exist', async () => {
    mockRedis.keys.mockResolvedValue([]);

    await service.handleStateTransitions();

    expect(mockRedis.keys).toHaveBeenCalledWith('sale:*:state');
    expect(mockSaleRepo.getSaleStatus).not.toHaveBeenCalled();
    expect(mockTransitionUseCase.execute).not.toHaveBeenCalled();
  });

  it('should process UPCOMING sales and call transitionUseCase', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      sku: 'WIDGET-001',
      state: SaleState.UPCOMING,
      stock: 100,
      initialStock: 100,
      productName: 'Widget',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
    });

    await service.handleStateTransitions();

    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-001');
  });

  it('should process ACTIVE sales and call transitionUseCase', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-002:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      sku: 'WIDGET-002',
      state: SaleState.ACTIVE,
      stock: 50,
      initialStock: 100,
      productName: 'Widget 2',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
    });

    await service.handleStateTransitions();

    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-002');
  });

  it('should skip ENDED sales', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-003:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      sku: 'WIDGET-003',
      state: SaleState.ENDED,
      stock: 0,
      initialStock: 100,
      productName: 'Widget 3',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
    });

    await service.handleStateTransitions();

    expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
    expect(mockTransitionUseCase.execute).not.toHaveBeenCalled();
  });

  it('should process multiple sales and skip ENDED ones', async () => {
    mockRedis.keys.mockResolvedValue([
      'sale:WIDGET-001:state',
      'sale:WIDGET-002:state',
      'sale:WIDGET-003:state',
    ]);

    mockSaleRepo.getSaleStatus
      .mockResolvedValueOnce({
        sku: 'WIDGET-001',
        state: SaleState.UPCOMING,
        stock: 100,
        initialStock: 100,
        productName: 'Widget 1',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      })
      .mockResolvedValueOnce({
        sku: 'WIDGET-002',
        state: SaleState.ENDED,
        stock: 0,
        initialStock: 100,
        productName: 'Widget 2',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      })
      .mockResolvedValueOnce({
        sku: 'WIDGET-003',
        state: SaleState.ACTIVE,
        stock: 50,
        initialStock: 100,
        productName: 'Widget 3',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      });

    await service.handleStateTransitions();

    expect(mockTransitionUseCase.execute).toHaveBeenCalledTimes(2);
    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-001');
    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-003');
  });

  it('should extract SKU correctly from key pattern', async () => {
    mockRedis.keys.mockResolvedValue(['sale:MY-COMPLEX-SKU-123:state']);
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      sku: 'MY-COMPLEX-SKU-123',
      state: SaleState.UPCOMING,
      stock: 10,
      initialStock: 10,
      productName: 'Complex Product',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
    });

    await service.handleStateTransitions();

    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('MY-COMPLEX-SKU-123');
  });

  it('should not throw when redis.keys fails', async () => {
    mockRedis.keys.mockRejectedValue(new Error('Redis connection error'));

    await expect(service.handleStateTransitions()).resolves.toBeUndefined();
    expect(mockTransitionUseCase.execute).not.toHaveBeenCalled();
  });

  it('should not throw when getSaleStatus fails for one key', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state', 'sale:WIDGET-002:state']);
    mockSaleRepo.getSaleStatus
      .mockRejectedValueOnce(new Error('Sale not found'))
      .mockResolvedValueOnce({
        sku: 'WIDGET-002',
        state: SaleState.ACTIVE,
        stock: 50,
        initialStock: 100,
        productName: 'Widget 2',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      });

    await expect(service.handleStateTransitions()).resolves.toBeUndefined();
    expect(mockTransitionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-002');
  });

  it('should not throw when transitionUseCase.execute fails for one key', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state', 'sale:WIDGET-002:state']);
    mockSaleRepo.getSaleStatus
      .mockResolvedValueOnce({
        sku: 'WIDGET-001',
        state: SaleState.UPCOMING,
        stock: 100,
        initialStock: 100,
        productName: 'Widget 1',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      })
      .mockResolvedValueOnce({
        sku: 'WIDGET-002',
        state: SaleState.ACTIVE,
        stock: 50,
        initialStock: 100,
        productName: 'Widget 2',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-02T00:00:00Z',
      });
    mockTransitionUseCase.execute
      .mockRejectedValueOnce(new Error('Transition failed'))
      .mockResolvedValueOnce('ACTIVE');

    await expect(service.handleStateTransitions()).resolves.toBeUndefined();
    expect(mockTransitionUseCase.execute).toHaveBeenCalledTimes(2);
  });

  it('should skip keys that do not match the expected pattern', async () => {
    mockRedis.keys.mockResolvedValue(['sale:WIDGET-001:state', 'invalid-key-format']);
    mockSaleRepo.getSaleStatus.mockResolvedValue({
      sku: 'WIDGET-001',
      state: SaleState.UPCOMING,
      stock: 100,
      initialStock: 100,
      productName: 'Widget 1',
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-02T00:00:00Z',
    });

    await service.handleStateTransitions();

    expect(mockSaleRepo.getSaleStatus).toHaveBeenCalledTimes(1);
    expect(mockTransitionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(mockTransitionUseCase.execute).toHaveBeenCalledWith('WIDGET-001');
  });
});
