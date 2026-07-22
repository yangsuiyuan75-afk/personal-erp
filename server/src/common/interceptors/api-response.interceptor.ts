import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { RequestWithId } from '../middleware/request-id.middleware';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      map((result) => {
        if (result instanceof StreamableFile) return result;
        if (result?.meta && Array.isArray(result.data)) {
          return { ...result, requestId: request.requestId };
        }
        return { data: result ?? null, requestId: request.requestId };
      }),
    );
  }
}
