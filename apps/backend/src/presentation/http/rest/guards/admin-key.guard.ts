import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const adminKey = request.headers['x-admin-key'] as string | undefined;
    const expected = this.config.get<string>('ADMIN_API_KEY');

    if (!adminKey || adminKey !== expected) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid X-Admin-Key header.',
        },
      });
    }
    return true;
  }
}
