"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, secureFetch } from "../lib/api";
import {
  AccountScreen,
  PillButton,
  PillLink,
} from "../journey/_account/account-shell";
import { readError } from "../journey/_account/account-data";

/** Attesa massima della conferma del provider prima di chiedere di riprovare. */
const POLL_MS = 2000;
const MAX_ATTEMPTS = 30;
const PLAN = "/user";

type Subscription = {
  status: string;
  horizon: "PROGRAM_3M" | "PROGRAM_6M" | "PROGRAM_12M" | null;
  billingCycle: string | null;
  amountCents: number | null;
  currency: string | null;
  nextChargeAt: string | null;
  entitlementEndAt?: string | null;
  cancelAtPeriodEnd?: boolean;
};
type Status = "CHECKING" | "PENDING" | "CANCELLED" | "PAID";

const MONTHS = { PROGRAM_3M: 3, PROGRAM_6M: 6, PROGRAM_12M: 12 } as const;
const CYCLES: Record<string, string> = {
  MONTHLY: "Mensile",
  QUARTERLY: "Trimestrale",
  SEMIANNUAL: "Semestrale",
  ANNUAL: "Annuale",
};
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
    cents / 100,
  );
const day = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/** Le righe di S19 con i dati dell'abbonamento confermato dal backend. */
function summary(s: Subscription) {
  const months = s.horizon ? MONTHS[s.horizon] : null;
  // Disdetto a fine periodo: il backend azzera nextChargeAt, la data che
  // conta è la fine dell'accesso.
  const until = s.cancelAtPeriodEnd ? s.entitlementEndAt : s.nextChargeAt;
  return [
    ["Programma", months ? `${months} mesi · P${months}` : "—"],
    ["Pagamento", (s.billingCycle && CYCLES[s.billingCycle]) || "—"],
    [
      "Importo",
      s.amountCents !== null && s.currency
        ? money(s.amountCents, s.currency)
        : "—",
    ],
    [
      s.cancelAtPeriodEnd ? "Attivo fino al" : "Prossimo addebito",
      until ? day(until) : "—",
    ],
  ];
}

/**
 * Ritorno dal checkout ospitato e S19 della demo PF10. Il pagamento vale solo
 * quando il webhook del provider ha attivato l'abbonamento: la pagina attende
 * `entitled` da GET /payments/subscription, poi crea il programma con l'azione
 * del percorso (idempotente) e mostra «Il tuo piano è pronto». Il semplice
 * ritorno dal checkout non basta mai.
 */
export default function SubscriptionReturnPage() {
  const [status, setStatus] = useState<Status>("CHECKING");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [planReady, setPlanReady] = useState(false);
  const [planError, setPlanError] = useState("");
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const retry = useCallback(() => {
    setStatus("CHECKING");
    setRound((r) => r + 1);
  }, []);

  /** Crea il programma dalla R consolidata e dall'orizzonte pagato. */
  const preparePlan = useCallback(async () => {
    setBusy(true);
    setPlanError("");
    try {
      const response = await secureFetch(`${API_BASE}/athlete-journey/program`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(await readError(response));
      setPlanReady(true);
    } catch (e) {
      setPlanError(
        e instanceof Error && e.message
          ? e.message
          : "Non siamo riusciti a preparare il piano. Riprova.",
      );
    } finally {
      setBusy(false);
    }
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
          subscription?: Subscription | null;
        };
        if (!active) return;
        if (response.ok && body.entitled && body.subscription) {
          setSubscription(body.subscription);
          setStatus("PAID");
          void preparePlan();
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
  }, [round, preparePlan]);

  useEffect(() => {
    heading.current?.focus();
  }, [status, planReady]);

  if (status === "PAID" && subscription)
    return (
      <AccountScreen
        footer={
          planReady ? (
            <PillLink href={PLAN} tone="lime">
              Vai al tuo piano
            </PillLink>
          ) : (
            <PillButton
              tone="lime"
              disabled={busy}
              onClick={() => void preparePlan()}
            >
              {busy ? "Prepariamo il tuo piano…" : "Prepara il tuo piano"}
            </PillButton>
          )
        }
      >
        <section className="pf-acc-paid" aria-labelledby="pf-acc-paid-title">
          <span className="pf-acc-paid-bar" aria-hidden="true" />
          <span className="pf-acc-kicker">Abbonamento attivo</span>
          <h1
            id="pf-acc-paid-title"
            className="pf-acc-title"
            tabIndex={-1}
            ref={heading}
          >
            {planReady
              ? "Il tuo piano è pronto."
              : "Prepariamo il tuo piano…"}
          </h1>
          <dl className="pf-acc-paid-rows">
            {summary(subscription).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {planError && (
            <p className="pf-acc-error" role="alert">
              {planError}
            </p>
          )}
          {!planReady && !planError && (
            <p className="pf-acc-muted" role="status">
              Partiamo dalla tua R consolidata e dall’orizzonte che hai scelto.
            </p>
          )}
        </section>
      </AccountScreen>
    );

  return (
    <AccountScreen
      footer={
        status === "PENDING" ? (
          <>
            <PillButton tone="lime" onClick={retry}>
              Verifica di nuovo
            </PillButton>
            <a className="pf-acc-link" href="/journey">
              Torna al tuo percorso
            </a>
          </>
        ) : status === "CANCELLED" ? (
          <PillLink href="/journey/checkout" tone="lime">
            Torna al checkout
          </PillLink>
        ) : undefined
      }
    >
      <section className="pf-acc-paid" aria-live="polite">
        {status === "CHECKING" && (
          <div role="status">
            <span className="pf-acc-kicker">Pagamento</span>
            <h1 className="pf-acc-title" tabIndex={-1} ref={heading}>
              Confermiamo il tuo pagamento…
            </h1>
            <p className="pf-acc-muted">
              Attendiamo la conferma dal sistema di pagamento. Il piano si
              attiva appena arriva.
            </p>
            <span className="pf-acc-paid-wait" aria-hidden="true" />
          </div>
        )}
        {status === "PENDING" && (
          <div role="status">
            <span className="pf-acc-kicker">Pagamento in verifica</span>
            <h1 className="pf-acc-title" tabIndex={-1} ref={heading}>
              Il pagamento è ancora in verifica.
            </h1>
            <p className="pf-acc-muted">
              Non abbiamo ancora ricevuto la conferma. Se hai completato il
              pagamento arriverà a breve: non avviamo un nuovo pagamento e il
              piano si attiva appena arriva la conferma.
            </p>
          </div>
        )}
        {status === "CANCELLED" && (
          <div role="status">
            <span className="pf-acc-kicker">Pagamento annullato</span>
            <h1 className="pf-acc-title" tabIndex={-1} ref={heading}>
              Nessun addebito.
            </h1>
            <p className="pf-acc-muted">
              Il pagamento non è stato completato. I tuoi scenari restano
              disponibili: puoi attivare il piano quando vuoi.
            </p>
            <a className="pf-acc-link" href="/journey">
              Torna al tuo percorso
            </a>
          </div>
        )}
      </section>
    </AccountScreen>
  );
}
