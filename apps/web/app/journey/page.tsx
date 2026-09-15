"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";
import { PF4Shell } from "../start/pf4-shell";
import { journeyHref } from "../start/discovery-state";

export default function JourneyPage() {
  const [journey, setJourney] = useState<{ phase: string; nextStep: string }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/auth/journey`, {
      credentials: "include",
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok)
          throw new Error("Il percorso non è disponibile. Riprova.");
        const result = await response.json();
        window.history.replaceState(null, "", journeyHref(result.nextStep));
        setJourney(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Connessione non disponibile",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <PF4Shell label="Il tuo percorso">
      <section className="pf4-body">
        <span className="pf4-kicker">
          {journey ? "Sessione autenticata" : "Il tuo percorso"}
        </span>
        <h1>
          {error ||
            (!journey
              ? "Riprendiamo da qui…"
              : journey.nextStep === "CONSENTS"
                ? "Il tuo account è pronto."
                : "Il tuo assessment ti aspetta.")}
        </h1>
        {journey && (
          <>
            <p>
              La discovery è salvata. Il prossimo passaggio è{" "}
              {journey.nextStep === "CONSENTS"
                ? "leggere e scegliere i consensi del percorso"
                : "completare l’assessment"}
              .
            </p>
            <div className="pf4-highlight">
              <span className="pf4-badge">Prossimo passo</span>
              <h2>
                {journey.nextStep === "CONSENTS"
                  ? "I tuoi consensi"
                  : "Assessment"}
              </h2>
              <p>
                Questo passaggio sarà disponibile nella prossima fase del
                percorso.
              </p>
            </div>
          </>
        )}
        {error && (
          <button className="pf4-cta" onClick={() => window.location.reload()}>
            Riprova
          </button>
        )}
      </section>
    </PF4Shell>
  );
}
