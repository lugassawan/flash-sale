import { UserIdMiddleware } from '../../src/presentation/http/rest/middleware/user-id.middleware';

describe('UserIdMiddleware', () => {
  let middleware: UserIdMiddleware;

  beforeEach(() => {
    middleware = new UserIdMiddleware();
  });

  it('should attach trimmed userId to request when header is present', (done) => {
    const req = { headers: { 'x-user-id': '  alice  ' } } as any;
    const res = {} as any;

    middleware.use(req, res, () => {
      expect(req.userId).toBe('alice');
      done();
    });
  });

  it('should call next when X-User-Id header is missing', (done) => {
    const req = { headers: {} } as any;
    const res = {} as any;

    middleware.use(req, res, () => {
      expect(req.userId).toBeUndefined();
      done();
    });
  });

  it('should not set userId when header is absent', (done) => {
    const req = { headers: {} } as any;
    const res = {} as any;

    middleware.use(req, res, () => {
      expect('userId' in req).toBe(false);
      done();
    });
  });
});
