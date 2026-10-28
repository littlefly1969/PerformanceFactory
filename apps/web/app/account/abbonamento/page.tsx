"use client";
import { useState } from "react";
import { athleteRequest, useAthlete } from "../../user/_components/use-athlete";
import { PillButton, PillLink } from "../../journey/_account/account-shell";
import { AccountFrame } from "../account-frame";

type State = "NONE" | "PENDING" | "ACTIVE" | "GRACE" | "PAUSED" | "ENDED";
type Subscription = {
  status: string;
  horizon: "PROGRAM_3M" | "PROGRAM_6M" | "PROGRAM_12M";
  billingCycle: string;
  amountCents: number;
  currency: string;
  currentPeriodStart: string | null;
  entitlementEndAt: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  programStartedAt: string | null;
  programEndsAt: string | null;
  endedAt?: string | null;
};
export type AccountSubscription = {
  state: State;
  entitled: boolean;
  subscription: Subscription | null;
  cancelDeadline: string | null;
  canCancel: boolean;
  canResume: boolean;
};

const HEADLINE: Record<State, [string, string]> = {
  NONE: [
    "Nessun abbonamento",
    "Non hai un abbonamento attivo. Il programma a pagamento si sceglie dagli scenari, quando la calibrazione è completata.",
  ],
  PENDING: [
    "Pagamento in verifica",
    "Hai avviato un pagamento che non risulta ancora confermato dal sistema di pagamento. Quando arriva la conferma l’abbonamento si attiva.",
  ],
  ACTIVE: ["Abbonamento attivo", "Il tuo programma è attivo."],
  GRACE: [
    "Pagamento da regolarizzare",
    "L’ultimo addebito non è andato a buon fine: l’accesso resta aperto fino alla fine del periodo di tolleranza.",
  ],
  PAUSED: [
    "Abbonamento sospeso",
    "Il contratto è sospeso: non è terminato e non serve acquistarne uno nuovo.",
  ],
  ENDED: ["Abbonamento terminato", "Il tuo ultimo abbonamento è terminato."],
};
const HORIZON = {
  PROGRAM_3M: "3 mesi",
  PROGRAM_6M: "6 mesi",
  PROGRAM_12M: "12 mesi",
};
const CYCLE: Record<string, string> = {
  MONTHLY: "Mensile",
  QUARTERLY: "Trimestrale",
  SEMIANNUAL: "Semestrale",
  ANNUAL: "Annuale",
};
const PER: Record<string, string> = {
  MONTHLY: "al mese",
  QUARTERLY: "ogni 3 mesi",
  SEMIANNUAL: "ogni 6 mesi",
  ANNUAL: "all’anno",
};

const price = (cents: number, currency: string) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
const date = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

/** Righe con i soli dati presenti: nessun campo vuoto spacciato per dato. */
function rows(view: AccountSubscription) {
  const s = view.subscription;
  if (!s) return [];
  const pending = view.state === "PENDING";
  return [
    ["Programma", HORIZON[s.horizon]],
    ["Pagamento", CYCLE[s.billingCycle] ?? s.billingCycle],
    [
      "Importo",
      `${price(s.amountCents, s.currency)} ${PER[s.billingCycle] ?? ""}`.trim(),
    ],
    ["Periodo dal", pending ? null : date(s.currentPeriodStart)],
    [
      view.state === "ENDED" ? "Accesso fino al" : "Periodo fino al",
      pending ? null : date(s.entitlementEndAt),
    ],
    [
      "Prossimo addebito",
      view.state === "ACTIVE" && !s.cancelAtPeriodEnd
        ? date(s.nextChargeAt)
        : null,
    ],
    ["Tolleranza fino al", view.state === "GRACE" ? date(s.graceEndsAt) : null],
    ["Programma dal", date(s.programStartedAt)],
    ["Programma fino al", date(s.programEndsAt)],
    ["Terminato il", view.state === "ENDED" ? date(s.endedAt) : null],
  ].filter((row): row is [string, string] => !!row[1]);
}

/**
 * Abbonamento nell'account: dati reali del contratto e azioni consentite
 * dalle API (disdetta a fine periodo e sua revoca). Il ritorno tecnico dal
 * checkout resta /abbonamento; qui non si acquista e non si cambiano prezzi.
 */
export default function AccountSubscriptionPage() {
  const { data, error, reload } = useAthlete<AccountSubscription>(
    "/payments/subscription/account",
  );
  const [confirm, setConfirm] = useState<"cancel" | "resume" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(kind: "cancel" | "resume") {
    setBusy(true);
    setMessage("");
    try {
      await athleteRequest(`/payments/subscription/${kind}`, {});
      setMessage(
        kind === "cancel"
          ? "Disdetta registrata: l’accesso resta fino alla fine del periodo pagato."
          : "Disdetta revocata: l’abbonamento continua.",
      );
      setConfirm(null);
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountFrame title="Abbonamento">
      {() => (
        <section className="pf-acc-card pf-account-sub">
          {error && (
            <p className="pf-acc-error" role="alert">
              {error}{" "}
              <button type="button" className="pf-acc-link" onClick={reload}>
                Riprova
              </button>
            </p>
          )}
          {!data && !error && (
            <p className="pf-acc-muted" role="status">
              Prepariamo la tua vista…
            </p>
          )}
          {data && (
            <>
              <span className="pf-acc-kicker">Il tuo abbonamento</span>
              <h1 className="pf-acc-title">{HEADLINE[data.state][0]}</h1>
              <p>{HEADLINE[data.state][1]}</p>
              {data.subscription?.cancelAtPeriodEnd &&
                data.state !== "ENDED" && (
                  <p>
                    Disdetta richiesta: non ci saranno altri addebiti e
                    l’accesso resta fino al{" "}
                    {date(data.subscription.entitlementEndAt) ??
                      "termine del periodo"}
                    .
                  </p>
                )}
              {!!rows(data).length && (
                <dl>
                  {rows(data).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {data.canCancel && data.cancelDeadline && (
                <p className="pf-acc-note">
                  Puoi disdire entro il {date(data.cancelDeadline)}.
                </p>
              )}
              {data.canCancel && confirm !== "cancel" && (
                <PillButton tone="outline" onClick={() => setConfirm("cancel")}>
                  Disdici a fine periodo
                </PillButton>
              )}
              {data.canResume && confirm !== "resume" && (
                <PillButton tone="outline" onClick={() => setConfirm("resume")}>
                  Revoca la disdetta
                </PillButton>
              )}
              {confirm && (
                <div role="group" aria-label="Conferma">
                  <p>
                    {confirm === "cancel"
                      ? "Confermi la disdetta? L’accesso resta fino alla fine del periodo pagato e non ci saranno altri addebiti."
                      : "Confermi di voler continuare l’abbonamento? Il prossimo addebito torna previsto alla fine del periodo."}
                  </p>
                  <PillButton disabled={busy} onClick={() => void act(confirm)}>
                    {confirm === "cancel" ? "Sì, disdici" : "Sì, continua"}
                  </PillButton>
                  <PillButton
                    tone="outline"
                    arrow={false}
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Annulla
                  </PillButton>
                </div>
              )}
              {message && <p role="status">{message}</p>}
              {(data.state === "NONE" || data.state === "ENDED") && (
                <PillLink href="/journey" tone="outline">
                  Torna al percorso
                </PillLink>
              )}
            </>
          )}
        </section>
      )}
    </AccountFrame>
  );
}
