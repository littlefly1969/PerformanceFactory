"use client";
import Link from "next/link";
import { AthleteShell } from "../_components/athlete-shell";
import { useAthlete } from "../_components/use-athlete";
import type { Home } from "../_components/athlete-types";
export default function ProfilePage() {
  const { data, error, reload } = useAthlete<Home>("/athlete/home");
  return (
    <AthleteShell
      label="Il tuo profilo"
      loading={!data}
      error={error}
      reload={reload}
    >
      {data && (
        <>
          <h1>{data.firstName ?? "Il tuo percorso"}.</h1>
          <section className="pf4-athlete-section">
            <span className="pf4-kicker">Il tuo programma</span>
            <h2>
              {data.program.durationWeeks
                ? `${data.program.durationWeeks} settimane`
                : "Il tuo percorso"}
            </h2>
            <p>
              {data.program.status === "ACTIVE"
                ? "Programma attivo"
                : "Programma in preparazione"}
            </p>
          </section>
          <section className="pf4-athlete-section">
            <span className="pf4-kicker">Il tuo coach</span>
            {data.coaches.length ? (
              data.coaches.map((c, i) => <h2 key={i}>{c.name}</h2>)
            ) : (
              <p>
                Il tuo coach comparirà qui quando sarà collegato al percorso.
              </p>
            )}
          </section>
          <Link className="pf4-text-link" href="/user/performance">
            La tua performance →
          </Link>
        </>
      )}
    </AthleteShell>
  );
}
