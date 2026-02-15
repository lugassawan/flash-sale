import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const correlationStorage = new AsyncLocalStorage<{
  correlationId: string;
}>();

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    correlationStorage.run({ correlationId }, () => next());
  }
}
