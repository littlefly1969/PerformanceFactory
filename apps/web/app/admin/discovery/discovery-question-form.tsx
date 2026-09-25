import type { DiscoveryQuestion } from "../../start/discovery-types";
import { DiscoveryConditionBuilder } from "./discovery-condition-builder";
import {
  asQuestion,
  inputTypeFor,
  isSportTarget,
  metadataFor,
  moveItem,
  TYPE_LABELS,
  type Template,
} from "./discovery-types";

export function DiscoveryQuestionForm({
  draft,
  savedOptionIds,
  templates,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Template;
  /** Gli ID gia salvati sono usati da risposte e condizioni: restano fissi. */
  savedOptionIds: Set<string>;
  templates: Template[];
  busy: boolean;
  onChange: (next: Template) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const meta = draft.optionsJson;
  const patch = (value: Partial<Template>) => onChange({ ...draft, ...value });
  const metadata = (value: Partial<Template["optionsJson"]>) =>
    patch({ optionsJson: { ...meta, ...value } });
  const options = meta.options ?? [];
  const setOption = (index: number, value: Partial<(typeof options)[0]>) =>
    metadata({
      options: options.map((o, i) => (i === index ? { ...o, ...value } : o)),
    });
  return (
    <form
      className="pf-card pf-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2>{draft.id ? `Modifica «${draft.label}»` : "Nuova domanda"}</h2>
      <fieldset disabled={busy} className="pf-stack">
        <label className="pf-field">
          Codice
          <input
            className="pf-input"
            required
            maxLength={100}
            pattern="[A-Za-z0-9_\-]+"
            disabled={Boolean(draft.id)}
            value={draft.key}
            onChange={(e) => patch({ key: e.target.value })}
          />
          {draft.id && (
            <small className="pf-muted">
              Le condizioni usano il codice: non si può cambiare.
            </small>
          )}
        </label>
        <label className="pf-field">
          Titolo
          <input
            className="pf-input"
            required
            maxLength={500}
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        <label className="pf-field">
          Descrizione
          <input
            className="pf-input"
            maxLength={2000}
            value={draft.helpText ?? ""}
            onChange={(e) => patch({ helpText: e.target.value })}
          />
        </label>
        <label className="pf-field">
          Tipo
          <select
            className="pf-input"
            value={meta.type}
            // Sport, specializzazione e obiettivo restano strutturali.
            disabled={Boolean(meta.target)}
            onChange={(e) => {
              const type = e.target.value as DiscoveryQuestion["type"];
              patch({
                inputType: inputTypeFor(type),
                optionsJson: {
                  ...metadataFor(type),
                  contextKey: meta.contextKey,
                  visibleWhen: meta.visibleWhen,
                },
              });
            }}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {draft.id && !meta.target && (
          <small className="pf-muted">
            Cambiare tipo azzera le opzioni; il salvataggio viene rifiutato se
            invalida le condizioni che dipendono da questa domanda.
          </small>
        )}

        <label>
          <input
            type="checkbox"
            checked={draft.required}
            disabled={Boolean(meta.target)}
            onChange={(e) => patch({ required: e.target.checked })}
          />{" "}
          Obbligatoria quando visibile
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />{" "}
          Attiva
        </label>
        <label className="pf-field">
          Context key
          <input
            className="pf-input"
            pattern="[a-z][a-z0-9_]{0,99}"
            placeholder="general_weight_kg"
            value={meta.contextKey ?? ""}
            onChange={(e) =>
              metadata({ contextKey: e.target.value || undefined })
            }
          />
        </label>
        {["single_choice", "multi_choice"].includes(meta.type) &&
          !isSportTarget(draft) && (
            <fieldset className="pf-stack">
              <legend>Opzioni</legend>
              {options.map((option, index) => (
                <fieldset className="pf-stack" key={index}>
                  <legend>Opzione {index + 1}</legend>
                  <label className="pf-field">
                    ID
                    <input
                      className="pf-input"
                      required
                      maxLength={100}
                      disabled={savedOptionIds.has(option.id)}
                      value={option.id}
                      onChange={(e) => setOption(index, { id: e.target.value })}
                    />
                  </label>
                  <label className="pf-field">
                    Etichetta
                    <input
                      className="pf-input"
                      required
                      maxLength={500}
                      value={option.label}
                      onChange={(e) =>
                        setOption(index, { label: e.target.value })
                      }
                    />
                  </label>
                  <label className="pf-field">
                    Valore
                    <input
                      className="pf-input"
                      maxLength={100}
                      placeholder="Uguale all'etichetta"
                      value={String(option.value)}
                      onChange={(e) =>
                        setOption(index, { value: e.target.value })
                      }
                    />
                  </label>
                  <label className="pf-field">
                    Descrizione
                    <input
                      className="pf-input"
                      maxLength={2000}
                      value={option.description ?? ""}
                      onChange={(e) =>
                        setOption(index, {
                          description: e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <div className="pf-actions">
                    <button
                      type="button"
                      className="pf-button-secondary"
                      disabled={index === 0}
                      onClick={() =>
                        metadata({
                          options: moveItem(options, index, index - 1),
                        })
                      }
                    >
                      Sposta su <span className="sr-only">{option.label}</span>
                    </button>
                    <button
                      type="button"
                      className="pf-button-secondary"
                      disabled={index === options.length - 1}
                      onClick={() =>
                        metadata({
                          options: moveItem(options, index, index + 1),
                        })
                      }
                    >
                      Sposta giù <span className="sr-only">{option.label}</span>
                    </button>
                    <button
                      type="button"
                      className="pf-button-secondary"
                      disabled={options.length === 1}
                      onClick={() =>
                        metadata({
                          options: options.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Rimuovi <span className="sr-only">{option.label}</span>
                    </button>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                className="pf-button-secondary"
                onClick={() =>
                  metadata({
                    options: [
                      ...options,
                      {
                        id: `opzione_${options.length + 1}`,
                        label: "",
                        value: "",
                      },
                    ],
                  })
                }
              >
                Aggiungi opzione
              </button>
            </fieldset>
          )}
        {["number", "scale"].includes(meta.type) && (
          <fieldset className="pf-stack">
            <legend>{TYPE_LABELS[meta.type]}</legend>
            {(["min", "max", "step"] as const).map((key, index) => (
              <label className="pf-field" key={key}>
                {["Minimo", "Massimo", "Incremento"][index]}
                <input
                  className="pf-input"
                  type="number"
                  step="any"
                  required={key !== "step"}
                  value={meta[key] ?? ""}
                  onChange={(e) =>
                    metadata({
                      [key]:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <label className="pf-field">
              Unità
              <input
                className="pf-input"
                maxLength={30}
                value={meta.ui?.unit ?? ""}
                onChange={(e) =>
                  metadata({
                    ui: { ...meta.ui, unit: e.target.value || undefined },
                  })
                }
              />
            </label>
          </fieldset>
        )}
        {!meta.target && (
          <DiscoveryConditionBuilder
            value={meta.visibleWhen}
            parents={templates
              .filter(
                (t) =>
                  t.isActive &&
                  t.key !== draft.key &&
                  (!draft.id || t.orderIndex < draft.orderIndex) &&
                  !isSportTarget(t),
              )
              .map(asQuestion)}
            onChange={(visibleWhen) => metadata({ visibleWhen })}
          />
        )}
        <div className="pf-actions">
          <button className="pf-button" type="submit">
            {busy ? "Salvataggio…" : "Salva"}
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={onCancel}
          >
            Annulla
          </button>
        </div>
        <p className="pf-muted">
          Il salvataggio è subito operativo per i nuovi atleti. Chi ha già
          completato la discovery conserva la configurazione che ha usato.
        </p>
      </fieldset>
    </form>
  );
}
