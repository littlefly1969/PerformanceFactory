"use client";

import { useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Settings = {
  confidenceThreshold: number;
  levelConfidenceThreshold: number;
  maxDays: number;
  closingDay: number;
  questionsPerDriver: number;
  driversPerRound: number;
  minHoursBetweenRounds: number;
  programBeforePaywall: boolean;
};

/** Campi modificabili: valori provvisori finché A4-D01 non è deciso. */
type NumericKey = Exclude<keyof Settings, "programBeforePaywall">;

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  {
    key: "confidenceThreshold",
    label: "Soglia di confidence per driver",
    hint: "La calibrazione si chiude quando ogni driver la raggiunge (0-100).",
  },
  {
    key: "levelConfidenceThreshold",
    label: "Soglia per il livello stimato",
    hint: "Sopra questa confidence il livello conta come stimato.",
  },
  {
    key: "maxDays",
    label: "Durata massima in giorni",
    hint: "Regola dei ~30 giorni del Blueprint.",
  },
  {
    key: "closingDay",
    label: "Giorno dell'assessment di chiusura",
    hint: "Da questo giorno il round successivo è quello di chiusura.",
  },
  {
    key: "driversPerRound",
    label: "Driver per round",
    hint: "Quanti driver meno affidabili approfondire in ogni round normale.",
  },
  {
    key: "questionsPerDriver",
    label: "Domande per driver",
    hint: "Domande scritte dall'AI per ogni driver del round.",
  },
  {
    key: "minHoursBetweenRounds",
    label: "Ore minime tra due round",
    hint: "Ritmo delle domande nei giorni di calibrazione.",
  },
];

const URL = `${API_BASE}/admin/calibration-config`;

export default function AdminCalibrationPage() {
  const [settings, setSettings] = useState<Settings>();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void secureFetch(URL, { credentials: "include" }).then(async (response) => {
      if (response.ok) setSettings((await response.json()) as Settings);
      else setMessage("Parametri non disponibili.");
    });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const response = await secureFetch(URL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    const data = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    if (!response.ok) {
      setMessage(
        Array.isArray(data.message)
          ? data.message.join(". ")
          : (data.message ?? "Salvataggio non riuscito."),
      );
      return;
    }
    setSettings(data as Settings);
    setMessage("Parametri salvati: valgono dai prossimi round.");
  };

  return (
    <ProductShell
      eyebrow="Amministrazione percorso"
      title="Calibrazione gratuita"
      description="Soglia di confidence e tempi della fase gratuita dopo la prima valutazione. Sono parametri provvisori: la soglia definitiva è una decisione aperta (A4-D01)."
    >
      {message && <div className="pf-alert warning">{message}</div>}
      {settings && (
        <section className="pf-panel">
          <div className="pf-stack">
            {FIELDS.map((field) => (
              <label className="pf-field" key={field.key}>
                {field.label}
                <input
                  className="pf-input"
                  type="number"
                  value={settings[field.key]}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      [field.key]: Number(event.target.value),
                    })
                  }
                />
                <span className="pf-field-hint">{field.hint}</span>
              </label>
            ))}
            <label className="pf-field">
              <span>
                <input
                  type="checkbox"
                  checked={settings.programBeforePaywall}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      programBeforePaywall: event.target.checked,
                    })
                  }
                />{" "}
                Programma di allenamento durante la calibrazione
              </span>
              <span className="pf-field-hint">
                Spento di default: per il Blueprint (A4.6) il programma si
                sblocca dopo la calibrazione. Decisione 13 ancora aperta.
              </span>
            </label>
            <button
              className="pf-button"
              type="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Salvataggio..." : "Salva parametri"}
            </button>
          </div>
        </section>
      )}
    </ProductShell>
  );
}
