"use client";
import Link from "next/link";
import { SubscriberShell } from "../_components/subscriber-shell";
import { useAthlete } from "../_components/use-athlete";
import type { Home } from "../_components/athlete-types";
import { ObjectiveCard } from "./objective-card";

export default function ObjectivesPage() {
  const { data: home, error, reload } = useAthlete<Home>("/athlete/home");
  const objectives = home?.objectives ?? [];
  return (
    <SubscriberShell
      back="/user"
      kicker="Obiettivi"
      nav
      error={error}
      reload={reload}
      loading={!home}
    >
      <h1 className="pfs-title">I tuoi obiettivi misurabili</h1>
      <p className="pfs-lead">
        Sono target personali, non garanzie. Ogni obiettivo dice cosa misuriamo
        e da dove arriva il dato.
      </p>
      {objectives.map((objective) => (
        <ObjectiveCard
          key={`${objective.area}-${objective.title}`}
          objective={objective}
        />
      ))}
      {home && !objectives.length && (
        <section className="pfs-card">
          <h2>Nessun obiettivo misurabile, per ora.</h2>
          <p>
            Gli obiettivi arrivano con il piano, quando c’è un dato di partenza
            da misurare: un test del check-in, una valutazione del coach o le
            tue risposte.
          </p>
          <Link className="pfs-row-link" href="/user/check-in">
            Vai al check-in <span aria-hidden="true">→</span>
          </Link>
        </section>
      )}
    </SubscriberShell>
  );
}
