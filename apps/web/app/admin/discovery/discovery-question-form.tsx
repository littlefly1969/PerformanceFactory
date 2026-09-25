import type { DiscoveryQuestion } from "../../start/discovery-types";
import { OptionListEditor } from "../components/option-list-editor";
import { DiscoveryConditionBuilder } from "./discovery-condition-builder";
import {
  asQuestion,
  inputTypeFor,
  isSportTarget,
  metadataFor,
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
            <OptionListEditor
              legend="Opzioni"
              options={options}
              labelOf={(o) => o.label}
              create={(index) => ({
                id: `opzione_${index + 1}`,
                label: "",
                value: "",
              })}
              fields={[
                {
                  key: "id",
                  label: "ID",
                  required: true,
                  maxLength: 100,
                  disabled: (o) => savedOptionIds.has(o.id),
                },
                {
                  key: "label",
                  label: "Etichetta",
                  required: true,
                  maxLength: 500,
                },
                {
                  key: "value",
                  label: "Valore",
                  maxLength: 100,
                  placeholder: "Uguale all'etichetta",
                },
                {
                  key: "description",
                  label: "Descrizione",
                  maxLength: 2000,
                  parse: (raw) => raw || undefined,
                },
              ]}
              onChange={(next) => metadata({ options: next })}
            />
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
