import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class UserIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void): void {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (userId) {
      (req as unknown as Record<string, unknown>).userId = userId.trim();
    }
    next();
  }
}
