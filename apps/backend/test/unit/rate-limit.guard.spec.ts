import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from '../../src/infrastructure/rate-limiting/rate-limit.guard';
import { RateLimiterStrategy } from '../../src/infrastructure/rate-limiting/rate-limiter.strategy';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockRateLimiter: jest.Mocked<RateLimiterStrategy>;

  const createMockContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockRateLimiter = {
      isAllowed: jest.fn().mockResolvedValue(true),
      getRetryAfter: jest.fn().mockResolvedValue(1),
    };
    guard = new RateLimitGuard(mockRateLimiter);
  });

  it('should allow request when rate limit is not exceeded', async () => {
    const context = createMockContext({ 'x-user-id': 'alice' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockRateLimiter.isAllowed).toHaveBeenCalledWith('alice');
  });

  it('should throw 429 when rate limit is exceeded', async () => {
    mockRateLimiter.isAllowed.mockResolvedValue(false);
    mockRateLimiter.getRetryAfter.mockResolvedValue(1);

    const context = createMockContext({ 'x-user-id': 'alice' });

    try {
      await guard.canActivate(context);
      fail('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

      const response = httpErr.getResponse() as Record<string, unknown>;
      expect(response).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: 1,
        },
      });
    }
  });

  it('should skip rate limiting when X-User-Id is absent', async () => {
    const context = createMockContext({});
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockRateLimiter.isAllowed).not.toHaveBeenCalled();
  });
});
