"use client";
import { useEffect, useRef, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import { tapGuard } from "../_components/tap-guard";
import "./entered.css";

const guard = tapGuard("welcome-entered");

/** Solo il nome: «Mario Rossi» diventa «Mario». */
const firstWord = (name: string | null | undefined) =>
  name?.trim().split(/\s+/)[0] || "";

/**
 * «Sei dentro, Mario.» (demo V11, W6): chiude il benvenuto dopo la slide 5,
 * prima della home. Il nome arriva dal profilo; senza, resta «Sei dentro.».
 */
export function EnteredScreen({ onEnter }: { onEnter: () => void }) {
  const [name, setName] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    let active = true;
    secureFetch(`${API_BASE}/athlete-journey/profile`)
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: { firstName?: string | null } | null) => {
        if (active) setName(firstWord(profile?.firstName));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="pf-entered">
      <div className="pf-entered-frame">
        <span className="pf-entered-glow" aria-hidden="true" />
        <div className="pf-entered-body">
          <div className="pf-entered-badge" aria-hidden="true">
            <svg viewBox="0 0 112 112">
              <circle className="is-track" cx="56" cy="56" r="52" />
              <circle className="is-ring" cx="56" cy="56" r="52" />
            </svg>
            <span>
              <svg viewBox="0 0 24 24">
                <path d="M4 12.5 L9.5 18 L20 6.5" />
              </svg>
            </span>
          </div>
          <p className="pf-entered-kicker">Profilo creato</p>
          <h1 ref={heading} tabIndex={-1}>
            {name ? `Sei dentro, ${name}.` : "Sei dentro."}
          </h1>
          <p className="pf-entered-lead">
            Il primo passo è l’assessment: pochi minuti per conoscerti e
            sbloccare la lezione di prova.
          </p>
        </div>
        <button
          type="button"
          className="pf-entered-cta"
          onClickCapture={guard}
          onClick={onEnter}
        >
          <span>Entra nell’app</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  );
}
