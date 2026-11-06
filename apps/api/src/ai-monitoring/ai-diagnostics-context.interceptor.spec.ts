import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable } from 'rxjs';
import { AiDiagnosticsContextInterceptor } from './ai-diagnostics-context.interceptor';
import { aiBusinessContext } from '../common/ai-diagnostic-context';

it('keeps concurrent HTTP diagnostic contexts separate across asynchronous work', async () => {
  const interceptor = new AiDiagnosticsContextInterceptor();
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/training' }),
    }),
  } as unknown as ExecutionContext;
  const handler = {
    handle: () =>
      new Observable<string>((subscriber) => {
        const id = aiBusinessContext.getStore()!.contextId;
        void Promise.resolve().then(() => {
          expect(aiBusinessContext.getStore()!.contextId).toBe(id);
          subscriber.next(id);
          subscriber.complete();
        });
      }),
  } satisfies CallHandler;
  const ids = await Promise.all([
    lastValueFrom(interceptor.intercept(context, handler)),
    lastValueFrom(interceptor.intercept(context, handler)),
  ]);
  expect(ids[0]).not.toBe(ids[1]);
  expect(aiBusinessContext.getStore()).toBeUndefined();
});
