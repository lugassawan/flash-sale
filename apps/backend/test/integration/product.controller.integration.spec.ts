import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { setupRedisContainer, teardownRedisContainer } from './setup/test-containers.setup';
import {
  setupPostgresContainer,
  teardownPostgresContainer,
  cleanDatabase,
} from './setup/pg-test-containers.setup';
import { ProductController } from '@/presentation/http/rest/controllers/product.controller';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';
import { PgProductRepository } from '@/infrastructure/persistence/postgresql/repositories/pg-product.repository';
import { PG_PRODUCT_REPOSITORY } from '@/infrastructure/persistence/postgresql/postgresql.module';
import { RedisSaleRepository } from '@/infrastructure/persistence/redis/repositories/redis-sale.repository';
import { SALE_REPOSITORY } from '@/core/domain/sale/repositories/sale.repository';
import { REDIS_CLIENT } from '@/infrastructure/persistence/redis/redis.module';
import { CreateSaleUseCase } from '@/application/use-cases/sale/create-sale.use-case';
import { GetSaleStatusUseCase } from '@/application/use-cases/sale/get-sale-status.use-case';
import { UpdateSaleUseCase } from '@/application/use-cases/sale/update-sale.use-case';
import { DeleteSaleUseCase } from '@/application/use-cases/sale/delete-sale.use-case';
import { AdminKeyGuard } from '@/presentation/http/rest/guards/admin-key.guard';
import { GlobalExceptionFilter } from '@/presentation/http/rest/filters/domain-exception.filter';
import { ResponseWrapperInterceptor } from '@/presentation/http/rest/interceptors/response-wrapper.interceptor';

const ADMIN_KEY = 'test-admin-key-secure-123';

describe('ProductController (Integration)', () => {
  let app: NestFastifyApplication;
  let redisClient: Redis;
  let dataSource: DataSource;
  let productOrmRepo: Repository<ProductOrmEntity>;
  let saleRepo: RedisSaleRepository;

  beforeAll(async () => {
    const [redisSetup, pgSetup] = await Promise.all([
      setupRedisContainer(),
      setupPostgresContainer(),
    ]);

    redisClient = redisSetup.client;
    dataSource = pgSetup.dataSource;

    productOrmRepo = dataSource.getRepository(ProductOrmEntity);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ADMIN_API_KEY: ADMIN_KEY })],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: pgSetup.container.getHost(),
          port: pgSetup.container.getMappedPort(5432),
          username: 'test',
          password: 'test',
          database: 'flashsale_test',
          entities: [ProductOrmEntity, PurchaseOrmEntity],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([ProductOrmEntity, PurchaseOrmEntity]),
      ],
      controllers: [ProductController],
      providers: [
        AdminKeyGuard,
        CreateSaleUseCase,
        GetSaleStatusUseCase,
        UpdateSaleUseCase,
        DeleteSaleUseCase,
        {
          provide: REDIS_CLIENT,
          useValue: redisClient,
        },
        {
          provide: SALE_REPOSITORY,
          useClass: RedisSaleRepository,
        },
        PgProductRepository,
        {
          provide: PG_PRODUCT_REPOSITORY,
          useExisting: PgProductRepository,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseWrapperInterceptor());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Initialize Lua scripts
    saleRepo = moduleFixture.get<RedisSaleRepository>(SALE_REPOSITORY);
    await saleRepo.onModuleInit();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([teardownRedisContainer(), teardownPostgresContainer()]);
  }, 30_000);

  beforeEach(async () => {
    await redisClient.flushdb();
    await saleRepo.onModuleInit();
    await cleanDatabase(dataSource);
  });

  const validProduct = {
    sku: 'WIDGET-001',
    productName: 'Limited Edition Widget',
    initialStock: 100,
    startTime: '2026-06-15T10:00:00.000Z',
    endTime: '2026-06-15T10:30:00.000Z',
  };

  // ────────────────────────────────────────────────
  // Authentication
  // ────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should return 401 when X-Admin-Key header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when X-Admin-Key header is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': 'wrong-key' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 on GET without admin key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 on PUT without admin key', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { productName: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 on DELETE without admin key', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/products/WIDGET-001',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ────────────────────────────────────────────────
  // POST /api/v1/products
  // ────────────────────────────────────────────────

  describe('POST /api/v1/products', () => {
    it('should create a product and return 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.sku).toBe('WIDGET-001');
      expect(body.data.productName).toBe('Limited Edition Widget');
      expect(body.data.initialStock).toBe(100);
      expect(body.data.state).toBe('UPCOMING');
      expect(body.data.createdAt).toBeDefined();
    });

    it('should persist product in Redis', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const state = await redisClient.get('sale:WIDGET-001:state');
      const stock = await redisClient.get('sale:WIDGET-001:stock');
      expect(state).toBe('UPCOMING');
      expect(stock).toBe('100');
    });

    it('should persist product in PostgreSQL', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const product = await productOrmRepo.findOne({ where: { sku: 'WIDGET-001' } });
      expect(product).not.toBeNull();
      expect(product!.productName).toBe('Limited Edition Widget');
      expect(product!.initialStock).toBe(100);
    });

    it('should reject invalid body with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: { sku: '', productName: '', initialStock: -1 },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject request with extra fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: { ...validProduct, extraField: 'not-allowed' },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────
  // GET /api/v1/products/:sku
  // ────────────────────────────────────────────────

  describe('GET /api/v1/products/:sku', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });
    });

    it('should return product with full details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.sku).toBe('WIDGET-001');
      expect(body.data.productName).toBe('Limited Edition Widget');
      expect(body.data.initialStock).toBe(100);
      expect(body.data.currentStock).toBe(100);
      expect(body.data.totalPurchases).toBe(0);
      expect(body.data.state).toBe('UPCOMING');
      expect(body.data.createdAt).toBeDefined();
    });

    it('should return 404 for non-existent product', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/NONEXISTENT',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should reflect correct totalPurchases from stock difference', async () => {
      // Simulate purchases by decrementing stock in Redis
      await redisClient.set('sale:WIDGET-001:state', 'ACTIVE');
      await redisClient.decrby('sale:WIDGET-001:stock', 13);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const body = response.json();
      expect(body.data.currentStock).toBe(87);
      expect(body.data.totalPurchases).toBe(13);
      expect(body.data.state).toBe('ACTIVE');
    });
  });

  // ────────────────────────────────────────────────
  // PUT /api/v1/products/:sku
  // ────────────────────────────────────────────────

  describe('PUT /api/v1/products/:sku', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });
    });

    it('should update product when UPCOMING', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: {
          productName: 'Super Limited Edition Widget',
          initialStock: 200,
        },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.productName).toBe('Super Limited Edition Widget');
      expect(body.data.initialStock).toBe(200);
      expect(body.data.state).toBe('UPCOMING');
    });

    it('should update Redis with new values', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { initialStock: 200 },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const stock = await redisClient.get('sale:WIDGET-001:stock');
      expect(stock).toBe('200');
    });

    it('should update PostgreSQL with new values', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { productName: 'Updated Name' },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const product = await productOrmRepo.findOne({ where: { sku: 'WIDGET-001' } });
      expect(product!.productName).toBe('Updated Name');
    });

    it('should handle empty body (no-op update) gracefully', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: {},
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.productName).toBe('Limited Edition Widget');
      expect(body.data.initialStock).toBe(100);
    });

    it('should reject update when sale is ACTIVE', async () => {
      await redisClient.set('sale:WIDGET-001:state', 'ACTIVE');

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { productName: 'Should Fail' },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject update when sale is ENDED', async () => {
      await redisClient.set('sale:WIDGET-001:state', 'ENDED');

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { productName: 'Should Fail' },
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ────────────────────────────────────────────────
  // DELETE /api/v1/products/:sku
  // ────────────────────────────────────────────────

  describe('DELETE /api/v1/products/:sku', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });
    });

    it('should delete product and return confirmation message', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('WIDGET-001');
      expect(body.data.message).toContain('reset');
    });

    it('should clean up all Redis keys', async () => {
      await app.inject({
        method: 'DELETE',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const state = await redisClient.get('sale:WIDGET-001:state');
      const stock = await redisClient.get('sale:WIDGET-001:stock');
      const config = await redisClient.hgetall('sale:WIDGET-001:config');

      expect(state).toBeNull();
      expect(stock).toBeNull();
      expect(Object.keys(config)).toHaveLength(0);
    });

    it('should clean up PostgreSQL record', async () => {
      await app.inject({
        method: 'DELETE',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      const product = await productOrmRepo.findOne({ where: { sku: 'WIDGET-001' } });
      expect(product).toBeNull();
    });
  });

  // ────────────────────────────────────────────────
  // Full Lifecycle
  // ────────────────────────────────────────────────

  describe('Full CRUD Lifecycle', () => {
    it('should support create → read → update → read → delete flow', async () => {
      // Create
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        payload: validProduct,
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(createRes.statusCode).toBe(201);

      // Read
      const readRes = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(readRes.statusCode).toBe(200);
      expect(readRes.json().data.initialStock).toBe(100);

      // Update
      const updateRes = await app.inject({
        method: 'PUT',
        url: '/api/v1/products/WIDGET-001',
        payload: { initialStock: 200 },
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().data.initialStock).toBe(200);

      // Read after update
      const readAfterUpdate = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(readAfterUpdate.json().data.initialStock).toBe(200);
      expect(readAfterUpdate.json().data.currentStock).toBe(200);

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(deleteRes.statusCode).toBe(200);

      // Verify deletion
      const readAfterDelete = await app.inject({
        method: 'GET',
        url: '/api/v1/products/WIDGET-001',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      expect(readAfterDelete.statusCode).toBe(404);
    });
  });
});
