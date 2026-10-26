"use client";
import { useEffect, useState } from "react";

/** Evento di Chrome/Edge/Samsung Internet: l'app è installabile. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "ios" | "android" | "other";
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let deferred: InstallPromptEvent | null = null;
let installed = false;
let capturing = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * Il browser segnala l'installabilità una volta per pagina, anche prima che
 * l'atleta arrivi alla schermata di installazione: lo teniamo da parte.
 */
export function captureInstallPrompt() {
  if (capturing || typeof window === "undefined") return;
  capturing = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function registerServiceWorker() {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV !== "production"
  )
    return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* Senza service worker il sito funziona uguale, solo non installabile. */
  });
}

/** Aperta dalla Home come app, non in una scheda del browser. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPadOS si presenta come Mac: lo riconosce il touch. */
export function installPlatform(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  touchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && touchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function useInstallPrompt() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    captureInstallPrompt();
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    canPrompt: deferred !== null,
    installed,
    async prompt(): Promise<InstallOutcome> {
      const event = deferred;
      if (!event) return "unavailable";
      // Il prompt di sistema si può mostrare una sola volta per evento.
      deferred = null;
      notify();
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome;
    },
  };
}

/** Solo per i test: riporta lo stato del modulo all'avvio. */
export function resetInstallPromptForTests() {
  deferred = null;
  installed = false;
  capturing = false;
  listeners.clear();
}
