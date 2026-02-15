import { ProductController } from '../../src/presentation/http/rest/controllers/product.controller';
import { CreateSaleUseCase } from '../../src/application/use-cases/sale/create-sale.use-case';
import { GetSaleStatusUseCase } from '../../src/application/use-cases/sale/get-sale-status.use-case';
import { UpdateSaleUseCase } from '../../src/application/use-cases/sale/update-sale.use-case';
import { DeleteSaleUseCase } from '../../src/application/use-cases/sale/delete-sale.use-case';
import { PgProductRepository } from '../../src/infrastructure/persistence/postgresql/repositories/pg-product.repository';
import { SaleState } from '../../src/core/domain/sale/value-objects/sale-state.vo';
import { NotFoundError } from '../../src/application/errors/application.error';

describe('ProductController', () => {
  let controller: ProductController;
  let mockCreateSale: jest.Mocked<CreateSaleUseCase>;
  let mockGetSaleStatus: jest.Mocked<GetSaleStatusUseCase>;
  let mockUpdateSale: jest.Mocked<UpdateSaleUseCase>;
  let mockDeleteSale: jest.Mocked<DeleteSaleUseCase>;
  let mockPgProductRepo: jest.Mocked<
    Pick<PgProductRepository, 'findBySku' | 'upsertBySku' | 'deleteBySku'>
  >;

  const createDto = {
    sku: 'WIDGET-001',
    productName: 'Limited Edition Widget',
    initialStock: 100,
    startTime: '2026-02-15T10:00:00.000Z',
    endTime: '2026-02-15T10:30:00.000Z',
  };

  const saleStatus = {
    sku: 'WIDGET-001',
    state: SaleState.ACTIVE,
    stock: 87,
    initialStock: 100,
    productName: 'Limited Edition Widget',
    startTime: '2026-02-15T10:00:00.000Z',
    endTime: '2026-02-15T10:30:00.000Z',
  };

  const productRecord = {
    sku: 'WIDGET-001',
    productName: 'Limited Edition Widget',
    initialStock: 100,
    startTime: new Date('2026-02-15T10:00:00.000Z'),
    endTime: new Date('2026-02-15T10:30:00.000Z'),
    state: SaleState.ACTIVE,
    createdAt: new Date('2026-02-14T08:00:00.000Z'),
  };

  beforeEach(() => {
    mockCreateSale = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateSaleUseCase>;

    mockGetSaleStatus = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetSaleStatusUseCase>;

    mockUpdateSale = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateSaleUseCase>;

    mockDeleteSale = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteSaleUseCase>;

    mockPgProductRepo = {
      findBySku: jest.fn(),
      upsertBySku: jest.fn(),
      deleteBySku: jest.fn(),
    };

    controller = new ProductController(
      mockCreateSale,
      mockGetSaleStatus,
      mockUpdateSale,
      mockDeleteSale,
      mockPgProductRepo as unknown as PgProductRepository,
    );
  });

  describe('create()', () => {
    it('should call createSaleUseCase, upsertBySku, findBySku, and return DTO', async () => {
      mockCreateSale.execute.mockResolvedValue(undefined);
      mockPgProductRepo.upsertBySku.mockResolvedValue(undefined);
      mockPgProductRepo.findBySku.mockResolvedValue(productRecord as any);

      const result = await controller.create(createDto);

      expect(mockCreateSale.execute).toHaveBeenCalledWith(createDto);
      expect(mockPgProductRepo.upsertBySku).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'WIDGET-001',
          productName: 'Limited Edition Widget',
          initialStock: 100,
          state: SaleState.UPCOMING,
          createdBy: 'admin',
        }),
      );
      expect(mockPgProductRepo.findBySku).toHaveBeenCalledWith('WIDGET-001');
      expect(result.sku).toBe('WIDGET-001');
      expect(result.productName).toBe('Limited Edition Widget');
      expect(result.initialStock).toBe(100);
      expect(result.state).toBe(SaleState.UPCOMING);
      expect(result.createdAt).toBe('2026-02-14T08:00:00.000Z');
    });

    it('should propagate use-case errors', async () => {
      mockCreateSale.execute.mockRejectedValue(new Error('duplicate SKU'));
      await expect(controller.create(createDto)).rejects.toThrow('duplicate SKU');
    });

    it('should use fallback date when findBySku returns null', async () => {
      mockCreateSale.execute.mockResolvedValue(undefined);
      mockPgProductRepo.upsertBySku.mockResolvedValue(undefined);
      mockPgProductRepo.findBySku.mockResolvedValue(null);

      const before = new Date().toISOString();
      const result = await controller.create(createDto);
      const after = new Date().toISOString();

      expect(result.createdAt >= before).toBe(true);
      expect(result.createdAt <= after).toBe(true);
    });
  });

  describe('findOne()', () => {
    it('should return detail DTO with correct totalPurchases', async () => {
      mockGetSaleStatus.execute.mockResolvedValue(saleStatus);
      mockPgProductRepo.findBySku.mockResolvedValue(productRecord as any);

      const result = await controller.findOne('WIDGET-001');

      expect(result.sku).toBe('WIDGET-001');
      expect(result.currentStock).toBe(87);
      expect(result.totalPurchases).toBe(13);
      expect(result.initialStock).toBe(100);
      expect(result.state).toBe(SaleState.ACTIVE);
    });

    it('should throw NotFoundError when product is null, initialStock is 0, and productName is empty', async () => {
      mockGetSaleStatus.execute.mockResolvedValue({
        sku: 'MISSING-001',
        state: SaleState.UPCOMING,
        stock: 0,
        initialStock: 0,
        productName: '',
        startTime: '',
        endTime: '',
      });
      mockPgProductRepo.findBySku.mockResolvedValue(null);

      await expect(controller.findOne('MISSING-001')).rejects.toThrow(NotFoundError);
    });

    it('should use product fallback times when saleStatus times are empty', async () => {
      mockGetSaleStatus.execute.mockResolvedValue({
        ...saleStatus,
        startTime: '',
        endTime: '',
      });
      mockPgProductRepo.findBySku.mockResolvedValue(productRecord as any);

      const result = await controller.findOne('WIDGET-001');

      expect(result.startTime).toBe('2026-02-15T10:00:00.000Z');
      expect(result.endTime).toBe('2026-02-15T10:30:00.000Z');
    });
  });

  describe('update()', () => {
    it('should call updateSaleUseCase, get status, upsert, and return DTO', async () => {
      const updateDto = { productName: 'Updated Widget', initialStock: 200 };

      mockUpdateSale.execute.mockResolvedValue(undefined);
      mockGetSaleStatus.execute.mockResolvedValue({
        ...saleStatus,
        productName: 'Updated Widget',
        initialStock: 200,
      });
      mockPgProductRepo.upsertBySku.mockResolvedValue(undefined);
      mockPgProductRepo.findBySku.mockResolvedValue({
        ...productRecord,
        productName: 'Updated Widget',
        initialStock: 200,
      } as any);

      const result = await controller.update('WIDGET-001', updateDto);

      expect(mockUpdateSale.execute).toHaveBeenCalledWith({
        sku: 'WIDGET-001',
        ...updateDto,
      });
      expect(mockGetSaleStatus.execute).toHaveBeenCalledWith('WIDGET-001');
      expect(mockPgProductRepo.upsertBySku).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'WIDGET-001',
          productName: 'Updated Widget',
          initialStock: 200,
          createdBy: 'admin',
          updatedBy: 'admin',
        }),
      );
      expect(result.sku).toBe('WIDGET-001');
      expect(result.productName).toBe('Updated Widget');
      expect(result.initialStock).toBe(200);
    });
  });

  describe('remove()', () => {
    it('should call deleteSaleUseCase and deleteBySku', async () => {
      mockDeleteSale.execute.mockResolvedValue(undefined);
      mockPgProductRepo.deleteBySku.mockResolvedValue(undefined);

      const result = await controller.remove('WIDGET-001');

      expect(mockDeleteSale.execute).toHaveBeenCalledWith('WIDGET-001');
      expect(mockPgProductRepo.deleteBySku).toHaveBeenCalledWith('WIDGET-001');
      expect(result).toEqual({
        message: 'Product WIDGET-001 and all associated sale data have been reset.',
      });
    });
  });
});
