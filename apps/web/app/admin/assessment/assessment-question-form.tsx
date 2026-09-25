import { OptionListEditor } from "../components/option-list-editor";
import type { AssessmentDraft, AssessmentOption } from "./assessment-types";

export function AssessmentQuestionForm({
  draft,
  areaName,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: AssessmentDraft;
  areaName: string;
  busy: boolean;
  onChange: (next: AssessmentDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="pf-card pf-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2>
        {draft.id ? `Modifica «${draft.label}»` : `Nuova domanda · ${areaName}`}
      </h2>
      <p className="pf-muted">
        Driver {areaName}. Driver e tipo a punteggio non si cambiano: ogni
        opzione assegna un punteggio da 0 a 100 al driver.
      </p>
      <fieldset disabled={busy} className="pf-stack">
        <label className="pf-field">
          Testo
          <input
            className="pf-input"
            required
            maxLength={500}
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
          />
        </label>
        <label className="pf-field">
          Aiuto
          <input
            className="pf-input"
            maxLength={2000}
            value={draft.helpText}
            onChange={(e) => onChange({ ...draft, helpText: e.target.value })}
          />
        </label>
        {!draft.id && (
          <label>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) =>
                onChange({ ...draft, isActive: e.target.checked })
              }
            />{" "}
            Attiva
          </label>
        )}
        <OptionListEditor<AssessmentOption>
          legend="Opzioni e punteggi"
          options={draft.options}
          minItems={2}
          labelOf={(o) => o.label}
          create={(index) => ({ value: String(index), label: "", score: "" })}
          fields={[
            { key: "value", label: "Valore", required: true, maxLength: 100 },
            {
              key: "label",
              label: "Etichetta",
              required: true,
              maxLength: 500,
            },
            {
              key: "score",
              label: "Punteggio",
              type: "number",
              required: true,
              min: 0,
              max: 100,
              parse: (raw) => (raw === "" ? "" : Number(raw)),
            },
          ]}
          onChange={(options) => onChange({ ...draft, options })}
        />
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
      </fieldset>
    </form>
  );
}
