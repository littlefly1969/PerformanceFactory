import { useEffect, useState, type ReactNode } from "react";
import { API_BASE } from "../lib/api";
import type { ConsentDocument } from "../journey/journey-types";

/** Documenti correnti di privacy e assistente AI; `null` se non disponibili. */
export function useConsentDocuments() {
  const [documents, setDocuments] = useState<ConsentDocument[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/consents/documents`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const valid =
          Array.isArray(body) &&
          body.length > 0 &&
          body.every(
            (d) =>
              typeof d?.type === "string" &&
              typeof d?.documentHash === "string" &&
              Array.isArray(d?.body),
          );
        if (active) setDocuments(valid ? (body as ConsentDocument[]) : null);
      })
      .catch(() => {
        if (active) setDocuments(null);
      });
    return () => {
      active = false;
    };
  }, []);
  return documents;
}

export function SignupCheck({
  name,
  checked,
  required,
  onChange,
  children,
  details,
}: {
  name: string;
  checked: boolean;
  required: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  details?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pf4-signup-check">
      <label>
        <input
          type="checkbox"
          name={name}
          required={required}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {children}
          <small>{required ? "Obbligatoria" : "Facoltativa"}</small>
        </span>
      </label>
      {details && (
        <>
          <button
            type="button"
            className="pf4-read"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Chiudi ↑" : "Leggi ↓"}
          </button>
          {open && <div className="pf4-read-body">{details}</div>}
        </>
      )}
    </div>
  );
}

/** Corpo leggibile di un documento di consenso. */
export function ConsentText({ document }: { document: ConsentDocument }) {
  return (
    <>
      <p>{document.summary}</p>
      {document.body.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}
