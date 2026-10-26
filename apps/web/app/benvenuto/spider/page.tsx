"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import {
  EstimatedSpider,
  type SpiderDriver,
} from "../../components/estimated-spider";
import { WelcomeIntro, WelcomeShell } from "../_components/welcome-shell";

const NEXT = "/benvenuto/regalo";

type Estimate = {
  estimated: boolean;
  scale: { min: number; max: number };
  drivers: SpiderDriver[];
};

export default function WelcomeSpiderPage() {
  const [estimate, setEstimate] = useState<Estimate>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    secureFetch(`${API_BASE}/athlete-journey/estimate`)
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login");
          return;
        }
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.message || "Non riusciamo a mostrare il tuo Spider.",
          );
        if (active) setEstimate(data);
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const estimated = estimate?.estimated ?? true;
  return (
    <WelcomeShell
      step={2}
      skipHref={NEXT}
      footer={
        <Link className="pf-welcome-cta" href={NEXT}>
          Continua
        </Link>
      }
    >
      <WelcomeIntro
        step={2}
        kicker="Il tuo Spider"
        title={
          <>
            Questo sei tu.
            <br />
            Per ora.
          </>
        }
      >
        {estimated
          ? "Il tratteggio indica una stima basata sulle tue risposte. Ogni test in campo la rende reale."
          : "È la tua prima valutazione: ogni test in campo la rende più precisa."}
      </WelcomeIntro>
      <div className="pf-welcome-center">
        {estimate && (
          <EstimatedSpider
            drivers={estimate.drivers}
            scale={estimate.scale}
            estimated={estimated}
          />
        )}
        {!estimate && !error && (
          <p className="pf-welcome-note" role="status">
            Prepariamo il tuo Spider…
          </p>
        )}
        {error && (
          <p role="alert" className="pf-welcome-error">
            {error}
          </p>
        )}
        {estimate && estimated && (
          <p className="pf-spider-legend">Profilo stimato</p>
        )}
      </div>
    </WelcomeShell>
  );
}
