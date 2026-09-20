"use client";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
export async function athleteRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await secureFetch(
    `${API_BASE}${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      code?: string;
    };
    if (response.status === 403 && error.code !== "REQUIRED_CONSENTS_MISSING") {
      const me = await secureFetch(`${API_BASE}/auth/me`);
      if (me.status === 401 || me.status === 403)
        window.location.assign("/login");
    }
    if (response.status === 401) window.location.assign("/login");
    if (error.code === "REQUIRED_CONSENTS_MISSING")
      window.location.assign("/consents");
    throw new Error(
      Array.isArray(error.message)
        ? error.message.join(". ")
        : (error.message ?? "Impossibile caricare i dati. Riprova."),
    );
  }
  return response.json() as Promise<T>;
}
export function useAthlete<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    athleteRequest<T>(path)
      .then((value) => {
        if (alive) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  useEffect(() => {
    const focus = () => reload();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  return { data, error, reload };
}
