import Link from "next/link";
import { ProductShell } from "@/app/components/product-shell";

export default function AiTunerHomePage() {
  return (
    <ProductShell
      eyebrow="AI TUNING"
      title="Spazio AI Tuner"
      description="Strumenti per migliorare i prompt AI, confrontare output e tenere sotto controllo costo e qualità."
    >
      <div className="pf-grid pf-grid-3" style={{ gap: 16 }}>
        <Link className="pf-card" href="/ai-tuner/audits">
          <h3>Audit &amp; Replay</h3>
          <p>
            Sfoglia le generazioni AI reali (atleti pseudonimizzati) e rifai la
            stessa chiamata con prompt diversi per confrontare i risultati.
          </p>
        </Link>
        <Link className="pf-card" href="/ai-tuner/replays">
          <h3>Replay storici</h3>
          <p>
            Ritrova i tuoi replay precedenti, le valutazioni rubric assegnate e
            i confronti già fatti.
          </p>
        </Link>
        <Link className="pf-card" href="/ai-tuner/golden-contexts">
          <h3>Golden context</h3>
          <p>
            Crea e gestisci un set di atleti-tipo riutilizzabili per testare in
            modo sistematico le varianti di prompt.
          </p>
        </Link>
        <Link className="pf-card" href="/ai-tuner/evaluations">
          <h3>Valutazioni</h3>
          <p>
            Lancia run di valutazione: ogni golden context viene passato
            attraverso tutte le varianti di prompt configurate.
          </p>
        </Link>
        <Link className="pf-card" href="/ai-tuner/cost">
          <h3>Costi AI</h3>
          <p>
            Token consumati per provider, modello e area. Riconosci i prompt
            obesi e l&apos;andamento dei costi.
          </p>
        </Link>
      </div>
    </ProductShell>
  );
}
