"use client";
import { useEffect } from "react";
import { captureInstallPrompt, registerServiceWorker } from "../lib/pwa";

/** Attiva la PWA su ogni pagina: service worker e segnale di installazione. */
export function PwaSetup() {
  useEffect(() => {
    captureInstallPrompt();
    registerServiceWorker();
  }, []);
  return null;
}
