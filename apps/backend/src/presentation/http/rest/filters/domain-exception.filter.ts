import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { DomainError } from '../../../../core/domain/sale/errors/domain.error';
import { ValidationError } from '../../../../application/errors/application.error';
import { NotFoundError } from '../../../../application/errors/application.error';
import { InfrastructureError } from '../../../../infrastructure/errors/infrastructure.error';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    retryAfter?: number;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof DomainError) {
      reply.status(HttpStatus.OK).send({
        success: false,
        error: { code: exception.code, message: exception.message },
      } satisfies ErrorResponseBody);
      return;
    }

    if (exception instanceof ValidationError) {
      reply.status(HttpStatus.BAD_REQUEST).send({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.fields && { fields: exception.fields }),
        },
      } satisfies ErrorResponseBody);
      return;
    }

    if (exception instanceof NotFoundError) {
      reply.status(HttpStatus.NOT_FOUND).send({
        success: false,
        error: { code: exception.code, message: exception.message },
      } satisfies ErrorResponseBody);
      return;
    }

    if (exception instanceof InfrastructureError) {
      this.logger.error(`Infrastructure failure: ${exception.message}`, exception.cause?.stack);
      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again.',
        },
      } satisfies ErrorResponseBody);
      return;
    }

    // NestJS built-in HTTP exceptions (UnauthorizedException, BadRequestException, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body =
        typeof response === 'object' && response !== null
          ? response
          : {
              success: false,
              error: { code: 'HTTP_ERROR', message: exception.message },
            };
      reply.status(status).send(body);
      return;
    }

    // Unexpected errors — never leak internals
    this.logger.error('Unhandled exception', exception);
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    } satisfies ErrorResponseBody);
  }
}
