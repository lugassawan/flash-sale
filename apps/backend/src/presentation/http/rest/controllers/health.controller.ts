import { Controller, Get, HttpStatus, Inject, Optional, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const DATA_SOURCE = Symbol('DATA_SOURCE');

interface RedisClient {
  ping(): Promise<string>;
}

interface DataSourceLike {
  query(sql: string): Promise<unknown>;
}

@Controller('health')
export class HealthController {
  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: RedisClient,
    @Optional() @Inject(DATA_SOURCE) private readonly dataSource?: DataSourceLike,
  ) {}

  @Get()
  async check(@Res() reply: FastifyReply): Promise<void> {
    const [redisCheck, pgCheck] = await Promise.all([
      this.redis
        ? this.ping(() => this.redis!.ping())
        : Promise.resolve({ status: 'not_configured' as const, latencyMs: 0 }),
      this.dataSource
        ? this.ping(() => this.dataSource!.query('SELECT 1'))
        : Promise.resolve({ status: 'not_configured' as const, latencyMs: 0 }),
    ]);

    const allUp =
      (redisCheck.status === 'up' || redisCheck.status === 'not_configured') &&
      (pgCheck.status === 'up' || pgCheck.status === 'not_configured');
    const statusCode = allUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    reply.status(statusCode).send({
      success: true,
      data: {
        status: allUp ? 'healthy' : 'degraded',
        uptime: Math.floor(process.uptime()),
        checks: { redis: redisCheck, postgresql: pgCheck },
      },
    });
  }

  private async ping(fn: () => Promise<unknown>): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await fn();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
