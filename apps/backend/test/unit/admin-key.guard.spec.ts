import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from '../../src/presentation/http/rest/guards/admin-key.guard';

describe('AdminKeyGuard', () => {
  let guard: AdminKeyGuard;
  let mockConfigService: Partial<ConfigService>;

  const createMockContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-admin-key-1234567890'),
    };
    guard = new AdminKeyGuard(mockConfigService as ConfigService);
  });

  it('should allow request with valid admin key', () => {
    const context = createMockContext({
      'x-admin-key': 'test-admin-key-1234567890',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject request with missing admin key', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should reject request with invalid admin key', () => {
    const context = createMockContext({ 'x-admin-key': 'wrong-key' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should include error response body in exception', () => {
    const context = createMockContext({});
    try {
      guard.canActivate(context);
      fail('Expected UnauthorizedException');
    } catch (err) {
      const response = (err as UnauthorizedException).getResponse();
      expect(response).toEqual({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid X-Admin-Key header.',
        },
      });
    }
  });
});
