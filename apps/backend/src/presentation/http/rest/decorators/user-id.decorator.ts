import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export function extractAndValidateUserId(ctx: ExecutionContext): string {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  const userId = request.headers['x-user-id'] as string | undefined;
  const trimmed = userId?.trim();

  if (!trimmed || trimmed.length === 0) {
    throw new BadRequestException({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'X-User-Id header is required and must be a non-empty string.',
        fields: {
          'X-User-Id': 'Must be a non-empty string (max 255 characters)',
        },
      },
    });
  }
  if (trimmed.length > 255) {
    throw new BadRequestException({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'X-User-Id must not exceed 255 characters.',
        fields: {
          'X-User-Id': 'Must be a non-empty string (max 255 characters)',
        },
      },
    });
  }
  return trimmed;
}

export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return extractAndValidateUserId(ctx);
});
