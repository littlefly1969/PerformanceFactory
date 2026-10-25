import Link from "next/link";
import "../start/pf4.css";

/** Mostrata dal service worker quando l'app installata non ha rete. */
export default function OfflinePage() {
  return (
    <main className="pf4">
      <section className="pf4-body" role="status">
        <span className="pf4-kicker">Performance Factory</span>
        <h1>Sei offline.</h1>
        <p>
          Il tuo percorso vive sul server: appena torna la connessione riprendi
          esattamente da dove eri.
        </p>
        <Link className="pf4-cta" href="/">
          Riprova
        </Link>
      </section>
    </main>
  );
}
