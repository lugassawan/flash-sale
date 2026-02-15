import Redis from 'ioredis';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import { RedisSaleRepository } from '../../src/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { SaleController } from '../../src/presentation/http/rest/controllers/sale.controller';
import { GetSaleStatusUseCase } from '../../src/application/use-cases/sale/get-sale-status.use-case';
import { Sale } from '../../src/core/domain/sale/entities/sale.entity';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleController (Integration)', () => {
  let client: Redis;
  let repository: RedisSaleRepository;
  let controller: SaleController;

  beforeAll(async () => {
    const setup = await setupRedisContainer();
    client = setup.client;
    repository = new RedisSaleRepository(client);
    await repository.onModuleInit();

    const getSaleStatus = new GetSaleStatusUseCase(repository);
    controller = new SaleController(getSaleStatus);
  }, 60_000);

  afterAll(async () => {
    await teardownRedisContainer();
  }, 30_000);

  beforeEach(async () => {
    await client.flushdb();
    await repository.onModuleInit();
  });

  const createTestSale = (
    overrides: Partial<{
      sku: string;
      productName: string;
      initialStock: number;
      startTime: Date;
      endTime: Date;
    }> = {},
  ): Sale => {
    const now = Date.now();
    return Sale.create({
      sku: overrides.sku ?? 'WIDGET-001',
      productName: overrides.productName ?? 'Test Widget',
      initialStock: overrides.initialStock ?? 100,
      startTime: overrides.startTime ?? new Date(now - 60_000),
      endTime: overrides.endTime ?? new Date(now + 3_600_000),
    });
  };

  const mockReply = () => ({ header: jest.fn().mockReturnThis() });

  it('should return sale status for an active sale', async () => {
    const sale = createTestSale();
    await repository.initializeSale(sale);
    await client.set('sale:WIDGET-001:state', 'ACTIVE');

    const reply = mockReply();
    const result = await controller.getStatus({ sku: 'WIDGET-001' }, reply as any);

    expect(result).toEqual(
      expect.objectContaining({
        sku: 'WIDGET-001',
        state: SaleState.ACTIVE,
        stock: 100,
        initialStock: 100,
        productName: 'Test Widget',
      }),
    );
  });

  it('should set Cache-Control header', async () => {
    const sale = createTestSale();
    await repository.initializeSale(sale);

    const reply = mockReply();
    await controller.getStatus({ sku: 'WIDGET-001' }, reply as any);

    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'public, max-age=1');
  });

  it('should return defaults for non-existent sale', async () => {
    const reply = mockReply();
    const result = await controller.getStatus({ sku: 'NONEXISTENT' }, reply as any);

    expect(result).toEqual(
      expect.objectContaining({
        sku: 'NONEXISTENT',
        state: SaleState.UPCOMING,
        stock: 0,
      }),
    );
  });

  it('should reflect decremented stock after purchases', async () => {
    const sale = createTestSale({ initialStock: 50 });
    await repository.initializeSale(sale);
    await client.set('sale:WIDGET-001:state', 'ACTIVE');
    await client.set('sale:WIDGET-001:stock', '42');

    const reply = mockReply();
    const result = await controller.getStatus({ sku: 'WIDGET-001' }, reply as any);

    expect(result.stock).toBe(42);
    expect(result.initialStock).toBe(50);
  });

  it('should return ENDED state with zero stock when sold out', async () => {
    const sale = createTestSale();
    await repository.initializeSale(sale);
    await client.set('sale:WIDGET-001:state', 'ENDED');
    await client.set('sale:WIDGET-001:stock', '0');

    const reply = mockReply();
    const result = await controller.getStatus({ sku: 'WIDGET-001' }, reply as any);

    expect(result.state).toBe(SaleState.ENDED);
    expect(result.stock).toBe(0);
  });
});
