import {
  CorrelationIdMiddleware,
  correlationStorage,
} from '../../src/presentation/http/rest/middleware/correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    mockReq = { headers: {} };
    mockRes = { setHeader: jest.fn() };
  });

  it('should generate a correlation ID if none provided', (done) => {
    middleware.use(mockReq, mockRes, () => {
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
      const store = correlationStorage.getStore();
      expect(store?.correlationId).toBeDefined();
      expect(store!.correlationId.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should use the provided X-Correlation-Id header', (done) => {
    const customId = 'my-custom-correlation-id';
    mockReq.headers['x-correlation-id'] = customId;

    middleware.use(mockReq, mockRes, () => {
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-correlation-id', customId);
      const store = correlationStorage.getStore();
      expect(store?.correlationId).toBe(customId);
      done();
    });
  });

  it('should set correlation ID on response header', (done) => {
    middleware.use(mockReq, mockRes, () => {
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
      done();
    });
  });

  it('should isolate correlation IDs between requests', (done) => {
    const ids: string[] = [];

    middleware.use(mockReq, mockRes, () => {
      ids.push(correlationStorage.getStore()!.correlationId);

      const req2 = { headers: {} } as any;
      const res2 = { setHeader: jest.fn() } as any;

      middleware.use(req2, res2, () => {
        ids.push(correlationStorage.getStore()!.correlationId);
        expect(ids[0]).not.toBe(ids[1]);
        done();
      });
    });
  });
});
