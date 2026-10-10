"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PF4Shell } from "../start/pf4-shell";
import { API_BASE, secureFetch } from "../lib/api";

/** Attesa massima della conferma del provider prima di chiedere di riprovare. */
const POLL_MS = 2000;
const MAX_ATTEMPTS = 30;

type Status = "CHECKING" | "PENDING" | "CANCELLED";

/**
 * Ritorno dal checkout ospitato. Il pagamento vale solo quando il webhook del
 * provider ha attivato l'abbonamento: la pagina attende l'entitlement e poi
 * riporta al percorso, dove si crea il programma.
 */
export default function SubscriptionReturnPage() {
  const [status, setStatus] = useState<Status>("CHECKING");
  const [round, setRound] = useState(0);
  const retry = useCallback(() => {
    setStatus("CHECKING");
    setRound((r) => r + 1);
  }, []);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("checkout") === "cancel"
    ) {
      setStatus("CANCELLED");
      return;
    }
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      attempts += 1;
      try {
        const response = await secureFetch(`${API_BASE}/payments/subscription`);
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          entitled?: boolean;
        };
        if (!active) return;
        if (response.ok && body.entitled) {
          window.location.replace("/journey");
          return;
        }
      } catch {
        /* Rete assente: si riprova al prossimo giro. */
      }
      if (!active) return;
      if (attempts >= MAX_ATTEMPTS) setStatus("PENDING");
      else timer = setTimeout(() => void check(), POLL_MS);
    };
    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [round]);
  return (
    <PF4Shell showLogout label="Abbonamento">
      {status === "CHECKING" && (
        <section className="pf4-body" role="status">
          <h1>Confermiamo il tuo pagamento…</h1>
          <p>
            Attendiamo la conferma dal sistema di pagamento. Ti portiamo al tuo
            programma appena arriva.
          </p>
        </section>
      )}
      {status === "PENDING" && (
        <section className="pf4-body" role="status">
          <h1>Il pagamento è ancora in verifica.</h1>
          <p>
            Non abbiamo ancora ricevuto la conferma. Se hai completato il
            pagamento arriverà a breve: riprova tra qualche istante.
          </p>
          <button className="pf4-cta" onClick={retry}>
            Verifica di nuovo
          </button>
        </section>
      )}
      {status === "CANCELLED" && (
        <section className="pf4-body" role="status">
          <h1>Pagamento annullato.</h1>
          <p>
            Nessun addebito. I tuoi scenari restano disponibili: puoi attivare
            il percorso quando vuoi.
          </p>
          <Link className="pf4-cta" href="/journey">
            Torna al tuo percorso
          </Link>
        </section>
      )}
    </PF4Shell>
  );
}
