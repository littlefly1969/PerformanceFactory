"use client";

import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";

/** Abort obsolete reads; auto refresh waits for the preceding request to finish. */
export function useAdminReport<T>(path: string | null, refreshMs = 0) {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    path: string | null;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ path: null, loading: false });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setSnapshot((s) => ({
        ...s,
        path,
        error: undefined,
        loading: true,
        data: s.path === path ? s.data : undefined,
      }));
      try {
        const response = await secureFetch(`${API_BASE}${path}`, {
          credentials: "include",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Accesso riservato agli amministratori."
              : "Dati non disponibili. Riprova con Aggiorna.",
          );
        const data = (await response.json()) as T;
        if (!controller.signal.aborted)
          setSnapshot({ path, data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setSnapshot((s) => ({
            ...s,
            path,
            loading: false,
            error:
              error instanceof Error ? error.message : "Errore di connessione.",
          }));
      } finally {
        if (refreshMs && !controller.signal.aborted)
          timer = setTimeout(() => void load(), refreshMs);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, version, refreshMs]);
  const current = snapshot.path === path;
  return {
    data: current ? snapshot.data : undefined,
    error: current ? snapshot.error : undefined,
    loading: !!path && (!current || snapshot.loading),
    refresh: () => setVersion((v) => v + 1),
  };
}
