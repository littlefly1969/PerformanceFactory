import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import { withAiBusinessContext } from '../common/ai-diagnostic-context';
import { recordAiError } from '../common/ai-telemetry';

/** Scope callbacks outside the provider too, with independent context for each HTTP request. */
@Injectable()
export class AiDiagnosticsContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; url?: string }>();
    return new Observable((subscriber) =>
      withAiBusinessContext(randomUUID(), 'HTTP', () =>
        next
          .handle()
          .pipe(
            tap({
              error: (error: unknown) =>
                recordAiError(error, 'BUSINESS', {
                  method: request.method,
                  path: request.url,
                }),
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }
}
