import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MetricsInterceptor } from '../../src/infrastructure/observability/metrics.interceptor';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let mockMetrics: {
    httpRequestTotal: { inc: jest.Mock };
    httpErrorTotal: { inc: jest.Mock };
    httpRequestDuration: { observe: jest.Mock };
  };

  const createMockContext = (
    method = 'GET',
    url = '/api/v1/test',
    statusCode = 200,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, url, routeOptions: { url } }),
        getResponse: () => ({ statusCode }),
      }),
    }) as unknown as ExecutionContext;

  const createCallHandler = (response: unknown = {}): CallHandler => ({
    handle: () => of(response),
  });

  const createErrorHandler = (error: Error): CallHandler => ({
    handle: () => throwError(() => error),
  });

  beforeEach(() => {
    mockMetrics = {
      httpRequestTotal: { inc: jest.fn() },
      httpErrorTotal: { inc: jest.fn() },
      httpRequestDuration: { observe: jest.fn() },
    };
    interceptor = new MetricsInterceptor(mockMetrics as unknown as MetricsService);
  });

  it('should record metrics on successful response', (done) => {
    const context = createMockContext('POST', '/api/v1/purchases', 200);
    const handler = createCallHandler({ data: 'ok' });

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(mockMetrics.httpRequestTotal.inc).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'POST', route: '/api/v1/purchases' }),
        );
        expect(mockMetrics.httpRequestDuration.observe).toHaveBeenCalled();
        expect(mockMetrics.httpErrorTotal.inc).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record error metrics for HttpException with correct status', (done) => {
    const context = createMockContext('POST', '/api/v1/purchases', 200);
    const error = new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    const handler = createErrorHandler(error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockMetrics.httpRequestTotal.inc).toHaveBeenCalledWith(
          expect.objectContaining({ status_code: '429' }),
        );
        expect(mockMetrics.httpErrorTotal.inc).toHaveBeenCalledWith(
          expect.objectContaining({ status_code: '429' }),
        );
        done();
      },
    });
  });

  it('should record 500 for non-HttpException errors', (done) => {
    const context = createMockContext('GET', '/api/v1/test', 200);
    const error = new Error('Unexpected');
    const handler = createErrorHandler(error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockMetrics.httpRequestTotal.inc).toHaveBeenCalledWith(
          expect.objectContaining({ status_code: '500' }),
        );
        expect(mockMetrics.httpErrorTotal.inc).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should not record error metrics for 2xx responses', (done) => {
    const context = createMockContext('GET', '/api/v1/test', 200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(mockMetrics.httpErrorTotal.inc).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
