import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../src/presentation/http/rest/filters/domain-exception.filter';
import { DomainError } from '../../src/core/domain/sale/errors/domain.error';
import { ValidationError } from '../../src/application/errors/application.error';
import { NotFoundError } from '../../src/application/errors/application.error';
import { InfrastructureError } from '../../src/infrastructure/errors/infrastructure.error';

class TestDomainError extends DomainError {
  readonly code = 'SOLD_OUT';
  constructor() {
    super('Product is sold out');
  }
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockReply: { status: jest.Mock; send: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockReply,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should map DomainError to 200 OK with error body', () => {
    filter.catch(new TestDomainError(), mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'SOLD_OUT', message: 'Product is sold out' },
    });
  });

  it('should map ValidationError to 400 with fields', () => {
    const error = new ValidationError('Invalid input', { sku: 'Required' });
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fields: { sku: 'Required' },
      },
    });
  });

  it('should map ValidationError without fields', () => {
    const error = new ValidationError('Invalid input');
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = mockReply.send.mock.calls[0][0];
    expect(body.error.fields).toBeUndefined();
  });

  it('should map NotFoundError to 404', () => {
    const error = new NotFoundError('Sale not found');
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sale not found' },
    });
  });

  it('should map InfrastructureError to 503 without leaking details', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new InfrastructureError('Redis connection failed', cause);
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    const body = mockReply.send.mock.calls[0][0];
    expect(body.error.message).toBe('Service temporarily unavailable. Please try again.');
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('should pass through HttpExceptions with standard envelope', () => {
    const error = new HttpException(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No auth' } },
      HttpStatus.UNAUTHORIZED,
    );
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockReply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No auth' },
    });
  });

  it('should normalize HttpExceptions without standard envelope', () => {
    const error = new HttpException(
      { message: ['name must be a string', 'age must be positive'], statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(error, mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = mockReply.send.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HTTP_ERROR');
    // Should not leak the raw array — falls back to exception.message
    expect(typeof body.error.message).toBe('string');
  });

  it('should map unexpected errors to 500 without leaking internals', () => {
    filter.catch(new Error('some internal crash'), mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = mockReply.send.mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
  });

  it('should handle non-Error thrown values', () => {
    filter.catch('string error', mockHost);

    expect(mockReply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
