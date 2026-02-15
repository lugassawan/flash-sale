import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { extractAndValidateUserId } from '../../src/presentation/http/rest/decorators/user-id.decorator';

describe('UserId decorator', () => {
  const createMockContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  it('should return trimmed user ID from header', () => {
    const ctx = createMockContext({ 'x-user-id': '  alice  ' });
    expect(extractAndValidateUserId(ctx)).toBe('alice');
  });

  it('should accept a valid user ID', () => {
    const ctx = createMockContext({ 'x-user-id': 'user-123' });
    expect(extractAndValidateUserId(ctx)).toBe('user-123');
  });

  it('should accept a user ID at exactly 255 characters', () => {
    const longId = 'a'.repeat(255);
    const ctx = createMockContext({ 'x-user-id': longId });
    expect(extractAndValidateUserId(ctx)).toBe(longId);
  });

  it('should throw BadRequestException when header is missing', () => {
    const ctx = createMockContext({});
    expect(() => extractAndValidateUserId(ctx)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when header is empty', () => {
    const ctx = createMockContext({ 'x-user-id': '' });
    expect(() => extractAndValidateUserId(ctx)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when header is whitespace-only', () => {
    const ctx = createMockContext({ 'x-user-id': '   ' });
    expect(() => extractAndValidateUserId(ctx)).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when header exceeds 255 characters', () => {
    const longId = 'a'.repeat(256);
    const ctx = createMockContext({ 'x-user-id': longId });
    expect(() => extractAndValidateUserId(ctx)).toThrow(BadRequestException);
  });

  it('should include VALIDATION_ERROR code in missing header response', () => {
    const ctx = createMockContext({});
    try {
      extractAndValidateUserId(ctx);
      fail('Expected BadRequestException');
    } catch (err) {
      const response = (err as BadRequestException).getResponse() as any;
      expect(response.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
