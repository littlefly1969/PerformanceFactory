"use client";
import { useEffect, useRef } from "react";

/**
 * Dopo disponibilità e classifica FIT l'AI scrive le domande dei driver: la
 * richiesta parte da sola; se non riesce l'atleta riprova, senza domande di
 * riserva.
 */
export function QuestionsPreparing({
  busy,
  failed,
  onPrepare,
}: {
  busy: boolean;
  failed: boolean;
  onPrepare: () => unknown;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void onPrepare();
  }, [onPrepare]);
  return (
    <section className="pf4-body" role="status">
      <span className="pf4-kicker">Domande su misura</span>
      <h1>
        {failed && !busy
          ? "Le tue domande non sono pronte."
          : "Prepariamo le tue domande…"}
      </h1>
      <p>
        Partiamo dalle tue risposte iniziali e dalla tua classifica FIT per
        scrivere le domande su ogni area della tua performance.
      </p>
      {failed && !busy && (
        <button className="pf4-cta" onClick={() => void onPrepare()}>
          Riprova
        </button>
      )}
    </section>
  );
}
