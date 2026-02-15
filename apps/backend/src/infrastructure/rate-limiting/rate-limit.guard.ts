import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RATE_LIMITER_STRATEGY, RateLimiterStrategy } from './rate-limiter.strategy';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(RATE_LIMITER_STRATEGY) private readonly rateLimiter: RateLimiterStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const userId = request.headers['x-user-id'] as string | undefined;

    // X-User-Id is guaranteed by UserIdMiddleware + @UserId() decorator on purchase endpoints.
    // If absent (e.g., internal or health routes), skip rate limiting gracefully.
    if (!userId) {
      return true;
    }

    const allowed = await this.rateLimiter.isAllowed(userId);

    if (!allowed) {
      const retryAfter = await this.rateLimiter.getRetryAfter(userId);
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
