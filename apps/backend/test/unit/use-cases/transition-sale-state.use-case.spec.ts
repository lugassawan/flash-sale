import { TransitionSaleStateUseCase } from '../../../src/application/use-cases/sale/transition-sale-state.use-case';
import { SaleRepository } from '../../../src/core/domain/sale/repositories/sale.repository';
import { EventPublisher } from '../../../src/application/ports/event-publisher.port';
import { SaleStartedEvent } from '../../../src/core/domain/sale/events/sale-started.event';
import { SaleEndedEvent } from '../../../src/core/domain/sale/events/sale-ended.event';
import { InvalidSKUError } from '../../../src/core/domain/sale/errors/invalid-sku.error';

describe('TransitionSaleStateUseCase', () => {
  let useCase: TransitionSaleStateUseCase;
  let mockSaleRepo: jest.Mocked<SaleRepository>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;

  beforeEach(() => {
    mockSaleRepo = {
      attemptPurchase: jest.fn(),
      getSaleStatus: jest.fn(),
      initializeSale: jest.fn(),
      transitionState: jest.fn(),
      deleteSale: jest.fn(),
    };
    mockEventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    useCase = new TransitionSaleStateUseCase(mockSaleRepo, mockEventPublisher);
  });

  it('should publish SaleStartedEvent when transitioning to ACTIVE', async () => {
    mockSaleRepo.transitionState.mockResolvedValue('ACTIVE');

    const result = await useCase.execute('WIDGET-001');

    expect(result).toBe('ACTIVE');
    expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockEventPublisher.publish).toHaveBeenCalledWith(expect.any(SaleStartedEvent));
  });

  it('should publish SaleEndedEvent when transitioning to ENDED', async () => {
    mockSaleRepo.transitionState.mockResolvedValue('ENDED');

    const result = await useCase.execute('WIDGET-001');

    expect(result).toBe('ENDED');
    expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockEventPublisher.publish).toHaveBeenCalledWith(expect.any(SaleEndedEvent));
  });

  it('should not publish event when no transition occurs', async () => {
    mockSaleRepo.transitionState.mockResolvedValue('UPCOMING');

    const result = await useCase.execute('WIDGET-001');

    expect(result).toBe('UPCOMING');
    expect(mockEventPublisher.publish).not.toHaveBeenCalled();
  });

  it('should delegate to SaleRepository with SKU value object', async () => {
    mockSaleRepo.transitionState.mockResolvedValue('ACTIVE');

    await useCase.execute('WIDGET-001');

    expect(mockSaleRepo.transitionState).toHaveBeenCalledTimes(1);
    const [skuArg, dateArg] = mockSaleRepo.transitionState.mock.calls[0];
    expect(skuArg.value).toBe('WIDGET-001');
    expect(dateArg).toBeInstanceOf(Date);
  });

  it('should throw on invalid SKU', async () => {
    await expect(useCase.execute('bad sku!')).rejects.toThrow(InvalidSKUError);
    expect(mockSaleRepo.transitionState).not.toHaveBeenCalled();
  });
});
