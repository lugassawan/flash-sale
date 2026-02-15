import { of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseWrapperInterceptor } from '../../src/presentation/http/rest/interceptors/response-wrapper.interceptor';

describe('ResponseWrapperInterceptor', () => {
  let interceptor: ResponseWrapperInterceptor;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    interceptor = new ResponseWrapperInterceptor();
  });

  const callWith = (data: any) => {
    const handler: CallHandler = { handle: () => of(data) };
    return interceptor.intercept(mockContext, handler);
  };

  it('should wrap plain data in { success: true, data }', (done) => {
    callWith({ id: 1, name: 'test' }).subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: { id: 1, name: 'test' },
      });
      done();
    });
  });

  it('should wrap string data', (done) => {
    callWith('hello').subscribe((result) => {
      expect(result).toEqual({ success: true, data: 'hello' });
      done();
    });
  });

  it('should wrap array data', (done) => {
    callWith([1, 2, 3]).subscribe((result) => {
      expect(result).toEqual({ success: true, data: [1, 2, 3] });
      done();
    });
  });

  it('should not re-wrap responses that already have success field', (done) => {
    const alreadyWrapped = { success: true, data: { id: 1 } };
    callWith(alreadyWrapped).subscribe((result) => {
      expect(result).toEqual(alreadyWrapped);
      done();
    });
  });

  it('should not re-wrap error responses', (done) => {
    const errorResponse = { success: false, error: { code: 'SOLD_OUT' } };
    callWith(errorResponse).subscribe((result) => {
      expect(result).toEqual(errorResponse);
      done();
    });
  });

  it('should pass through null responses unchanged', (done) => {
    callWith(null).subscribe((result) => {
      expect(result).toBeNull();
      done();
    });
  });

  it('should pass through undefined responses unchanged', (done) => {
    callWith(undefined).subscribe((result) => {
      expect(result).toBeUndefined();
      done();
    });
  });

  it('should wrap objects that have success field but not envelope shape', (done) => {
    const domainObject = { success: true, count: 5 };
    callWith(domainObject).subscribe((result) => {
      expect(result).toEqual({ success: true, data: { success: true, count: 5 } });
      done();
    });
  });
});
