import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const method = request.method;
    const route = request.routeOptions?.url ?? request.url;

    return next.handle().pipe(
      tap({
        next: () => this.record(method, route, reply.statusCode, start),
        error: (err: unknown) => {
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          this.record(method, route, statusCode, start);
        },
      }),
    );
  }

  private record(method: string, route: string, statusCode: number, start: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { method, route, status_code: String(statusCode) };

    this.metrics.httpRequestTotal.inc(labels);
    this.metrics.httpRequestDuration.observe(labels, durationSeconds);

    if (statusCode >= 400) {
      this.metrics.httpErrorTotal.inc(labels);
    }
  }
}
