"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptResult } from "../use-journey";

/**
 * Nuovi tentativi automatici quando l'AI non risponde (domande, valutazioni):
 * dopo il primo errore passeggero si riprova da soli fino a tre volte,
 * avvisando l'atleta; poi gli si dice che i server sono sovraccarichi.
 */
export const AUTO_RETRIES = 3;
/** Attesa prima di ogni nuovo tentativo, che cresce a ogni giro. */
export const RETRY_DELAYS_MS = [2000, 4000, 6000];

export type RetryState =
  /** Nessun nuovo tentativo in corso. */
  | { phase: "idle" }
  /** Problema passeggero: il tentativo `attempt` di AUTO_RETRIES sta per partire o è in corso. */
  | { phase: "retrying"; attempt: number }
  /** Tutti i tentativi falliti: i server sono sovraccarichi. */
  | { phase: "exhausted" };

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function useAutoRetry() {
  const [state, setState] = useState<RetryState>({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /**
   * Esegue `step` e lo ritenta da solo dopo un errore passeggero. Restituisce
   * l'esito finale: «transient» vuol dire che i tentativi sono finiti.
   */
  const run = useCallback(
    async (step: () => Promise<AttemptResult>): Promise<AttemptResult> => {
      setState({ phase: "idle" });
      for (let retry = 0; ; retry++) {
        const result = await step();
        if (!alive.current) return result;
        if (result !== "transient") {
          setState({ phase: "idle" });
          return result;
        }
        if (retry >= AUTO_RETRIES) {
          setState({ phase: "exhausted" });
          return result;
        }
        setState({ phase: "retrying", attempt: retry + 1 });
        await wait(RETRY_DELAYS_MS[retry] ?? RETRY_DELAYS_MS.at(-1) ?? 0);
        if (!alive.current) return result;
      }
    },
    [],
  );
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { retry: state, run, reset };
}
