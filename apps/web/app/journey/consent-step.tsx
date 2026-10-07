import { useState } from "react";
import type { ConsentDocument } from "./journey-types";
export function ConsentStep({
  documents,
  busy,
  onAccept,
  askAdult = false,
}: {
  documents: ConsentDocument[];
  busy: boolean;
  onAccept: (input: unknown) => void;
  /** Con Google l'età non è stata ancora dichiarata: la si chiede qui. */
  askAdult?: boolean;
}) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [adult, setAdult] = useState(false);
  const [marketing, setMarketing] = useState(false);
  return (
    <section className="pf4-body">
      <span className="pf4-kicker">Il tuo percorso, le tue scelte</span>
      <h1>Prima di iniziare.</h1>
      <p>Leggi i documenti e scegli se proseguire con il tuo assessment.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAccept({
            privacyAccepted: true,
            aiAssistantAccepted: true,
            marketingAccepted: marketing,
            ...(askAdult ? { adultConfirmed: adult } : {}),
            acceptedDocuments: documents.map(
              ({ type, version, documentHash }) => ({
                type,
                version,
                documentHash,
              }),
            ),
          });
        }}
      >
        {documents.map((d) => (
          <div key={`${d.type}:${d.documentHash}`} className="pf4-consent">
            <details>
              <summary>{d.title}</summary>
              <p>{d.summary}</p>
              {d.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </details>
            <label>
              <input
                type="checkbox"
                required
                checked={!!accepted[d.documentHash]}
                onChange={(e) =>
                  setAccepted({
                    ...accepted,
                    [d.documentHash]: e.target.checked,
                  })
                }
              />{" "}
              Ho letto e accetto {d.title}
            </label>
          </div>
        ))}
        <div className="pf4-consent">
          <label>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />{" "}
            Facoltativo: voglio ricevere novità, offerte e iniziative dei circoli
            partner. Puoi cambiare idea in qualsiasi momento dal profilo.
          </label>
          {askAdult && (
            <label>
              <input
                type="checkbox"
                required
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
              />{" "}
              Dichiaro di avere almeno 18 anni
            </label>
          )}
        </div>
        <button
          className="pf4-cta"
          disabled={
            busy ||
            (askAdult && !adult) ||
            !documents.length ||
            documents.some((d) => !accepted[d.documentHash])
          }
        >
          Accetta e continua
        </button>
      </form>
    </section>
  );
}
