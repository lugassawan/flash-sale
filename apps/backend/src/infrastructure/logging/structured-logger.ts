import { LoggerService, Injectable } from '@nestjs/common';
import { correlationStorage } from '@/presentation/http/rest/middleware/correlation-id.middleware';

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: string, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    const msg = message instanceof Error ? message.message : String(message);
    const stack = message instanceof Error ? message.stack : trace;
    this.write('error', msg, context, { trace: stack });
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: string,
    message: string,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const store = correlationStorage.getStore();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: store?.correlationId ?? 'no-context',
      context: context ?? 'Application',
      message,
      ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
