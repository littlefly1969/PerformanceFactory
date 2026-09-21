import { googleDiscoveryReady } from "../start/google-registration";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, secureFetch } from "../lib/api";
import { DRAFT_KEY } from "../start/discovery-state";
import type { Journey, ConsentDocument } from "./journey-types";
export function useJourney() {
  const [journey, setJourney] = useState<Journey>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [documents, setDocuments] = useState<ConsentDocument[]>([]);
  const [goalReview, setGoalReview] = useState(false);
  const lock = useRef(false);
  const read = async (response: Response) => {
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "GOAL_RISK_ACK_REQUIRED") setGoalReview(true);
      throw new Error(
        Array.isArray(data.message)
          ? data.message.join(". ")
          : data.message || "Operazione non riuscita. Riprova.",
      );
    }
    return data;
  };
  const refresh = useCallback(async () => {
    const response = await secureFetch(`${API_BASE}/auth/journey`);
    if (response.status === 401 || response.status === 403) {
      window.location.replace("/login");
      return;
    }
    if (response.status === 404) {
      window.location.replace("/");
      return;
    }
    setJourney(await read(response));
  }, []);
  useEffect(() => {
    let active = true;
    const init = async () => {
      if (
        new URLSearchParams(window.location.search).get("google") === "complete"
      ) {
        await read(
          await fetch(`${API_BASE}/auth/google/register/pending`, {
            credentials: "include",
          }),
        );
        const config = await read(
          await fetch(`${API_BASE}/public/athlete-discovery`, {
            cache: "no-store",
          }),
        );
        let raw: string | null = null;
        try {
          raw = sessionStorage.getItem(DRAFT_KEY);
        } catch {
          /* Resume discovery with storage guidance. */
        }
        if (!googleDiscoveryReady(raw, config)) {
          window.location.replace("/start?google=complete");
          return;
        }
        const docs = await read(await fetch(`${API_BASE}/consents/documents`));
        if (active) {
          setDocuments(docs);
          setGoogle(true);
        }
      } else await refresh();
    };
    void init().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (journey?.phase !== "PROCESSING" || busy) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [journey?.phase, busy, refresh]);
  async function action(path: string, input: unknown = {}) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await read(
        await secureFetch(`${API_BASE}/athlete-journey/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      setJourney(data);
      setGoalReview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connessione non disponibile");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function accept(input: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (google) {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw)
          throw new Error(
            "La discovery non è disponibile in questo browser. Torna su /start per completarla.",
          );
        await read(
          await fetch(`${API_BASE}/auth/google/register/complete`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(input as object),
              discovery: JSON.parse(raw),
            }),
          }),
        );
        sessionStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem("pf.accessToken");
        window.history.replaceState(null, "", "/journey");
        setGoogle(false);
      } else
        await read(
          await secureFetch(`${API_BASE}/consents/required`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
        );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consensi non salvati");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    journey,
    error,
    busy,
    google,
    documents,
    goalReview,
    action,
    accept,
    refresh,
  };
}
