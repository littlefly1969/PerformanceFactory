"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AthleteShell } from "../_components/athlete-shell";
import { athleteRequest, useAthlete } from "../_components/use-athlete";
type Ability = {
  id: string; name: string; status: "EMPTY" | "PREPARING" | "READY" | "REVIEW" | "ERROR" | "COMPLETED" | "REJECTED";
  retryScheduled: boolean; errorCode: string | null;
  plan: { id: string; version: number; items: { id: string; title: string; body: string; status: string }[]; checkInId: string | null } | null;
};
const labels: Record<Ability["status"], string> = { EMPTY: "Da preparare", PREPARING: "In preparazione", READY: "Piano disponibile", REVIEW: "In revisione", ERROR: "Preparazione sospesa", COMPLETED: "Piano completato", REJECTED: "Da rivedere con il professionista" };
export default function AbilitiesPage() {
  const { data, error, reload } = useAthlete<{ abilities: Ability[] }>("/athlete/abilities");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = data?.abilities.some(a => ["PREPARING", "ERROR", "REVIEW"].includes(a.status));
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(reload, 10000);
    return () => clearInterval(timer);
  }, [pending, reload]);
  async function prepare() {
    setBusy(true); setMessage("");
    try { await athleteRequest("/athlete/abilities/request", {}); reload(); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <AthleteShell label="Abilità" loading={!data} error={error} reload={reload}>
    <h1>Il tuo lavoro, abilità per abilità.</h1>
    <p>Piani specifici per le abilità del tuo sport, con esercizi e check-in dedicati.</p>
    {message && <p role="alert" className="pf4-error">{message}</p>}
    {data?.abilities.some(a => ["EMPTY", "ERROR"].includes(a.status)) && <button className="pf4-cta" disabled={busy} onClick={prepare}>{busy ? "Invio richiesta…" : "Prepara i piani mancanti"}</button>}
    {data?.abilities.length === 0 && <p>Le abilità del tuo sport devono ancora essere configurate.</p>}
    {data?.abilities.map(a => <section className="pf4-athlete-section pf4-ability-card" key={a.id} aria-label={a.name}>
      <span className="pf4-kicker">{labels[a.status]}</span>
      <h2>{a.name}</h2>
      {a.status === "PREPARING" && <p>Stiamo preparando il tuo piano. Comparirà qui appena pronto.</p>}
      {a.status === "REVIEW" && <p>Il piano è pronto e attende la revisione del professionista.</p>}
      {a.status === "REJECTED" && <p>Il professionista deve rivedere la proposta prima della pubblicazione.</p>}
      {a.status === "ERROR" && <p role="status">{a.errorCode?.startsWith("PROFESSIONAL_") ? "Serve un professionista competente assegnato a questa abilità." : "La preparazione non è ancora riuscita."} {a.retryScheduled && "La richiesta è salvata e verrà riprovata automaticamente."}</p>}
      {a.plan && <>
        <p>Piano {a.plan.version} · {a.plan.items.filter(i => i.status === "COMPLETED").length}/{a.plan.items.length} attività completate</p>
        {a.plan.items.map(item => <details key={item.id} className="pf4-ability-exercise"><summary>{item.title}{item.status === "COMPLETED" ? " · Completato" : ""}</summary><p>{item.body}</p></details>)}
        <div className="pf4-ability-actions">
          <Link href={`/user/plan?areaId=${encodeURIComponent(a.id)}`}>Apri attività e feedback →</Link>
          {a.plan.checkInId && <Link href={`/user/questions?areaId=${encodeURIComponent(a.id)}`}>Vai al check-in →</Link>}
        </div>
      </>}
    </section>)}
  </AthleteShell>;
}
