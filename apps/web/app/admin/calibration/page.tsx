"use client";

import { useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { ConfidencePolicies } from "./confidence-policies";

type Settings = {
  levelConfidenceThreshold: number;
  maxDays: number;
  questionsPerDriver: number;
  driversPerRound: number;
  programBeforePaywall: boolean;
};

/** Campi modificabili: valori provvisori finché A4-D01 non è deciso. */
type NumericKey = Exclude<keyof Settings, "programBeforePaywall">;

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  {
    key: "levelConfidenceThreshold",
    label: "Soglia per il livello stimato",
    hint: "Sopra questa confidence il livello conta come stimato.",
  },
  {
    key: "maxDays",
    label: "Durata indicativa in giorni",
    hint: "Riferimento dei ~30 giorni del Blueprint: non chiude e non consolida R.",
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
      description="Regole di confidence e parametri dei round della fase gratuita. I valori sono provvisori: le soglie definitive sono decisioni aperte (A4-D01, PF-FS-PREPAYWALL OP-02 e OP-03)."
    >
      <ConfidencePolicies />
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
                Programma prima del paywall
              </span>
              <span className="pf-field-hint">
                Spento di default: per il Blueprint (A4.6) il programma si
                sblocca dopo scenari, scelta del percorso e abbonamento. Acceso,
                chi è in calibrazione può ottenerlo dal flusso precedente.
                Decisione 13 ancora aperta.
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
