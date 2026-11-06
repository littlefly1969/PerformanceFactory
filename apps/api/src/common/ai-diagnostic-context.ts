import { AsyncLocalStorage } from 'node:async_hooks';
import type { AiTrace } from './ai-telemetry';

export type AiBusinessContext = {
  contextId: string;
  kind: string;
  lastTrace?: AiTrace;
};
export const aiBusinessContext = new AsyncLocalStorage<AiBusinessContext>();
export function withAiBusinessContext<T>(
  contextId: string,
  kind: string,
  action: () => T,
): T {
  return aiBusinessContext.run({ contextId, kind }, action);
}
