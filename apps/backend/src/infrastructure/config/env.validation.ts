import { z } from 'zod';

export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Auth
  ADMIN_API_KEY: z.string().min(16, 'Admin key must be at least 16 characters'),

  // Rate Limiting
  RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PURCHASE_PER_USER: z.coerce.number().int().positive().default(1),

  // Observability
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Scheduling
  CRON_STATE_INTERVAL_MS: z.coerce.number().int().positive().default(100),
  CRON_RECONCILIATION_SCHEDULE: z.string().default('*/5 * * * *'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
