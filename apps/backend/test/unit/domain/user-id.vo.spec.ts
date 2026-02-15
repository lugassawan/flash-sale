import { UserId } from '../../../src/core/domain/purchase/value-objects/user-id.vo';
import { InvalidUserIdError } from '../../../src/core/domain/sale/errors/invalid-user-id.error';

describe('UserId Value Object', () => {
  it('should create with valid string', () => {
    const userId = UserId.create('alice@test.com');
    expect(userId.value).toBe('alice@test.com');
  });

  it('should trim whitespace', () => {
    const userId = UserId.create('  alice@test.com  ');
    expect(userId.value).toBe('alice@test.com');
  });

  it('should reject empty string', () => {
    expect(() => UserId.create('')).toThrow(InvalidUserIdError);
    expect(() => UserId.create('')).toThrow('non-empty');
  });

  it('should reject whitespace-only string', () => {
    expect(() => UserId.create('   ')).toThrow(InvalidUserIdError);
  });

  it('should reject null/undefined', () => {
    expect(() => UserId.create(null as unknown as string)).toThrow(InvalidUserIdError);
    expect(() => UserId.create(undefined as unknown as string)).toThrow(InvalidUserIdError);
  });

  it('should accept exactly 255 characters', () => {
    const value = 'a'.repeat(255);
    const userId = UserId.create(value);
    expect(userId.value).toBe(value);
  });

  it('should reject more than 255 characters', () => {
    const value = 'a'.repeat(256);
    expect(() => UserId.create(value)).toThrow(InvalidUserIdError);
    expect(() => UserId.create(value)).toThrow('255');
  });

  it('should support equality comparison', () => {
    const a = UserId.create('alice');
    const b = UserId.create('alice');
    const c = UserId.create('bob');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
