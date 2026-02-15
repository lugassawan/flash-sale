import { validateEnv } from '../../src/infrastructure/config/env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  ADMIN_API_KEY: 'a-very-secure-key-1234',
};

describe('validateEnv', () => {
  describe('valid minimal config', () => {
    it('should accept only required fields and apply defaults', () => {
      const result = validateEnv(validEnv);

      expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
      expect(result.ADMIN_API_KEY).toBe(validEnv.ADMIN_API_KEY);
    });
  });

  describe('defaults', () => {
    it('should default NODE_ENV to development', () => {
      const result = validateEnv(validEnv);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should default PORT to 3000', () => {
      const result = validateEnv(validEnv);
      expect(result.PORT).toBe(3000);
    });

    it('should default HOST to 0.0.0.0', () => {
      const result = validateEnv(validEnv);
      expect(result.HOST).toBe('0.0.0.0');
    });

    it('should default REDIS_HOST to localhost', () => {
      const result = validateEnv(validEnv);
      expect(result.REDIS_HOST).toBe('localhost');
    });

    it('should default REDIS_PORT to 6379', () => {
      const result = validateEnv(validEnv);
      expect(result.REDIS_PORT).toBe(6379);
    });

    it('should default LOG_LEVEL to info', () => {
      const result = validateEnv(validEnv);
      expect(result.LOG_LEVEL).toBe('info');
    });
  });

  describe('NODE_ENV', () => {
    it.each(['development', 'test', 'production'] as const)(
      'should accept NODE_ENV=%s',
      (nodeEnv) => {
        const result = validateEnv({ ...validEnv, NODE_ENV: nodeEnv });
        expect(result.NODE_ENV).toBe(nodeEnv);
      },
    );

    it('should reject invalid NODE_ENV', () => {
      expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
        'Environment validation failed',
      );
    });
  });

  describe('DATABASE_URL', () => {
    it('should throw when DATABASE_URL is missing', () => {
      const { DATABASE_URL: _, ...envWithout } = validEnv;
      expect(() => validateEnv(envWithout)).toThrow('Environment validation failed');
    });
  });

  describe('ADMIN_API_KEY', () => {
    it('should throw when ADMIN_API_KEY is missing', () => {
      const { ADMIN_API_KEY: _, ...envWithout } = validEnv;
      expect(() => validateEnv(envWithout)).toThrow('Environment validation failed');
    });

    it('should throw when ADMIN_API_KEY is shorter than 16 characters', () => {
      expect(() => validateEnv({ ...validEnv, ADMIN_API_KEY: 'short' })).toThrow(
        'Admin key must be at least 16 characters',
      );
    });
  });

  describe('coercion', () => {
    it('should coerce PORT from string to number', () => {
      const result = validateEnv({ ...validEnv, PORT: '8080' });
      expect(result.PORT).toBe(8080);
    });

    it('should coerce REDIS_PORT from string to number', () => {
      const result = validateEnv({ ...validEnv, REDIS_PORT: '6380' });
      expect(result.REDIS_PORT).toBe(6380);
    });
  });

  describe('PORT validation', () => {
    it('should reject non-positive PORT', () => {
      expect(() => validateEnv({ ...validEnv, PORT: -1 })).toThrow('Environment validation failed');
    });
  });

  describe('LOG_LEVEL', () => {
    it.each(['debug', 'info', 'warn', 'error'] as const)('should accept LOG_LEVEL=%s', (level) => {
      const result = validateEnv({ ...validEnv, LOG_LEVEL: level });
      expect(result.LOG_LEVEL).toBe(level);
    });
  });

  describe('REDIS_PASSWORD', () => {
    it('should not require REDIS_PASSWORD', () => {
      const result = validateEnv(validEnv);
      expect(result.REDIS_PASSWORD).toBeUndefined();
    });

    it('should accept REDIS_PASSWORD when provided', () => {
      const result = validateEnv({ ...validEnv, REDIS_PASSWORD: 'secret' });
      expect(result.REDIS_PASSWORD).toBe('secret');
    });
  });
});
