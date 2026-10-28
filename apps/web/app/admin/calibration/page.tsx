"use client";

import { useEffect, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { ConfidencePolicies } from "./confidence-policies";

type Settings = {
  levelConfidenceThreshold: number;
  maxDays: number;
  programBeforePaywall: boolean;
  questionsPerMicroTest: number;
  initialQuestionsPerArea: number;
  unsafeMicroTestTerms?: string[];
  unsafeTrainingTerms?: string[];
};

type TermKey = "unsafeMicroTestTerms" | "unsafeTrainingTerms";

/** Campi modificabili: valori provvisori finché A4-D01 non è deciso. */
type NumericKey = Exclude<keyof Settings, "programBeforePaywall" | TermKey>;

/** Testo delle aree di testo: una parola o frase per riga. */
const termTexts = (settings: Settings) =>
  Object.fromEntries(
    TERM_FIELDS.map(({ key }) => [key, (settings[key] ?? []).join("\n")]),
  );

/** Una parola o frase per riga; le righe vuote non contano. */
const termLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
    key: "questionsPerMicroTest",
    label: "Domande per ogni micro-prova",
    hint: "Indicazione per l'AI: in media una micro-prova ogni N domande. L'AI ne tiene conto ma decide passo per passo. 0 = nessuna indicazione.",
  },
  {
    key: "initialQuestionsPerArea",
    label: "Domande iniziali per driver",
    hint: "Quante domande conoscitive scrive l'AI per ogni driver dopo la classifica FIT, da 1 a 4. Vale per i nuovi assessment.",
  },
];

const MATCHING_HINT =
  "Una parola o frase per riga. Basta l'inizio della parola («massimal» vale per massimale e massimali); maiuscole e accenti non contano. Non contano solo se la frase le esclude direttamente («non massimale», «senza sprint», «evita sforzi massimali»): «nessuna pausa tra sprint» o «non evitare gli sprint» restano vietate.";

/** Parole vietate nei contenuti scritti dall'AI, una lista per tipo di contenuto. */
const TERM_FIELDS: { key: TermKey; label: string; hint: string }[] = [
  {
    key: "unsafeMicroTestTerms",
    label: "Parole vietate nei micro-test",
    hint: `Un micro-test che le contiene viene scartato e riscritto. ${MATCHING_HINT}`,
  },
  {
    key: "unsafeTrainingTerms",
    label: "Parole vietate negli allenamenti",
    hint: `Vale per il programma sportivo e per le sedute di area. Un piano che le contiene viene riscritto una volta, poi la generazione si ferma e riprova più tardi. Vuota: nessun controllo. ${MATCHING_HINT}`,
  },
];

const URL = `${API_BASE}/admin/calibration-config`;

export default function AdminCalibrationPage() {
  const [settings, setSettings] = useState<Settings>();
  const [terms, setTerms] = useState<Partial<Record<TermKey, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void secureFetch(URL, { credentials: "include" }).then(async (response) => {
      if (response.ok) {
        const data = (await response.json()) as Settings;
        setSettings(data);
        setTerms(termTexts(data));
      } else setMessage("Parametri non disponibili.");
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
      body: JSON.stringify({
        ...settings,
        ...Object.fromEntries(
          TERM_FIELDS.filter(({ key }) => settings[key]).map(({ key }) => [
            key,
            termLines(terms[key] ?? ""),
          ]),
        ),
      }),
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
    setTerms(termTexts(data as Settings));
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
            {TERM_FIELDS.filter(({ key }) => settings[key]).map((field) => (
              <label className="pf-field" key={field.key}>
                {field.label}
                <textarea
                  className="pf-textarea"
                  rows={8}
                  value={terms[field.key] ?? ""}
                  onChange={(event) =>
                    setTerms({ ...terms, [field.key]: event.target.value })
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
