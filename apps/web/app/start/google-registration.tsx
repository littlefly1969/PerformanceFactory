"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";
import { DRAFT_KEY, restoreDraft } from "./discovery-state";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";

// Return existing Google members through the application's role/journey router.
export const googleRegistrationHref = `${API_BASE}/auth/google/register?returnTo=${encodeURIComponent("/")}`;

export function usePendingGoogle() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("google") !== "complete"
    )
      return;
    let active = true;
    fetch(`${API_BASE}/auth/google/register/pending`, {
      credentials: "include",
    })
      .then((response) => {
        if (active) setPending(response.ok);
      })
      .catch(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return pending;
}

/** Resume only a complete draft from the currently published question tree. */
export function googleDiscoveryReady(
  raw: string | null,
  config: DiscoveryConfiguration,
) {
  const draft = restoreDraft(raw, config);
  return ["result", "registration"].includes(draft.currentStep);
}

export function GoogleRegistrationButton({
  draft,
  pending = false,
  disabled,
  onError,
}: {
  draft?: DiscoveryDraft;
  pending?: boolean;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  return (
    <button
      type="button"
      className="pf4-cta pf4-secondary"
      disabled={disabled}
      onClick={() => {
        try {
          if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          else {
            sessionStorage.setItem("pf.storage-check", "1");
            sessionStorage.removeItem("pf.storage-check");
          }
        } catch {
          onError("Abilita la memoria del browser per continuare con Google.");
          return;
        }
        window.location.assign(
          pending ? "/journey?google=complete" : googleRegistrationHref,
        );
      }}
    >
      {pending ? "Continua con il tuo account Google" : "Registrati con Google"}
    </button>
  );
}
