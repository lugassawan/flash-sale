import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseWrapperInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Don't wrap null/undefined responses (e.g., SSE streams, manual reply)
        if (data === undefined || data === null) {
          return data;
        }

        // Don't re-wrap responses that already have success field
        if (typeof data === 'object' && 'success' in data) {
          return data;
        }

        return { success: true, data };
      }),
    );
  }
}
