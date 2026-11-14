import Link from "next/link";
import "./lesson-declined.css";

/**
 * Lezione di prova rifiutata (demo V11), uguale in home e profilo: «Hai
 * scelto di non fare la lezione.» e «Ho cambiato idea», che riapre la scelta
 * del circolo. Si mostra solo finché la rinuncia è reversibile (fase
 * DECLINED, calibrazione aperta).
 */
export function LessonDeclined() {
  return (
    <section className="pf-lz-declined" aria-label="Lezione di prova">
      <div className="pf-lz-declined-head">
        <span className="pf-lz-declined-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <path d="M4 4l16 16" />
          </svg>
        </span>
        <div>
          <span className="pf-lz-declined-kicker">Lezione di prova</span>
          <strong>Hai scelto di non fare la lezione.</strong>
        </div>
      </div>
      <Link className="pf-lz-declined-cta" href="/journey/circolo">
        <span>Ho cambiato idea</span>
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
