import type {
  DiscoveryCondition,
  DiscoveryQuestion,
} from "../../start/discovery-types";
export function ConditionEditor({
  value,
  parents,
  onChange,
}: {
  value?: DiscoveryCondition;
  parents: DiscoveryQuestion[];
  onChange: (value?: DiscoveryCondition) => void;
}) {
  const update = (
    index: number,
    patch: Partial<DiscoveryCondition["rules"][number]>,
  ) => {
    if (value)
      onChange({
        ...value,
        rules: value.rules.map((r, i) =>
          i === index ? { ...r, ...patch } : r,
        ),
      });
  };
  return (
    <fieldset className="pf-stack">
      <legend>Quando mostrare la domanda</legend>
      <label className="pf-field">
        Visibilità
        <select
          className="pf-input"
          value={value?.match ?? "always"}
          onChange={(e) => {
            if (e.target.value === "always") onChange(undefined);
            else
              onChange({
                match: e.target.value as "all" | "any",
                rules: value?.rules ?? [
                  {
                    question: parents[0]?.code ?? "",
                    operator: "in",
                    values: [],
                  },
                ],
              });
          }}
        >
          <option value="always">Sempre</option>
          <option value="all" disabled={!parents.length}>
            Se tutte le condizioni sono vere
          </option>
          <option value="any" disabled={!parents.length}>
            Se almeno una condizione è vera
          </option>
        </select>
      </label>
      {value?.rules.map((rule, index) => {
        const parent = parents.find((q) => q.code === rule.question);
        return (
          <fieldset className="pf-stack" key={index}>
            <legend>Condizione {index + 1}</legend>
            <label className="pf-field">
              Risposta alla domanda
              <select
                className="pf-input"
                value={rule.question}
                onChange={(e) =>
                  update(index, { question: e.target.value, values: [] })
                }
              >
                {parents.map((q) => (
                  <option key={q.code} value={q.code}>
                    {q.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="pf-field">
              Confronto
              <select
                className="pf-input"
                value={rule.operator}
                onChange={(e) =>
                  update(index, { operator: e.target.value as "in" | "not_in" })
                }
              >
                <option value="in">È una delle risposte</option>
                <option value="not_in">Non è nessuna delle risposte</option>
              </select>
            </label>
            {parent &&
            ["single_choice", "multi_choice", "boolean"].includes(
              parent.type,
            ) ? (
              <div className="pf-stack">
                {parent.options.map((option) => {
                  const v =
                    parent.type === "boolean" ? option.value : option.id;
                  return (
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        checked={rule.values.includes(v)}
                        onChange={(e) =>
                          update(index, {
                            values: e.target.checked
                              ? [...rule.values, v]
                              : rule.values.filter((item) => item !== v),
                          })
                        }
                      />{" "}
                      {option.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <label className="pf-field">
                Valore
                <input
                  className="pf-input"
                  type={parent?.type === "date" ? "date" : "number"}
                  step="any"
                  value={String(rule.values[0] ?? "")}
                  onChange={(e) =>
                    update(index, {
                      values:
                        e.target.value === ""
                          ? []
                          : [
                              parent?.type === "date"
                                ? e.target.value
                                : Number(e.target.value),
                            ],
                    })
                  }
                />
              </label>
            )}
            <button
              className="pf-button-secondary"
              type="button"
              onClick={() => {
                const rules = value.rules.filter((_, i) => i !== index);
                onChange(rules.length ? { ...value, rules } : undefined);
              }}
            >
              Rimuovi condizione
            </button>
          </fieldset>
        );
      })}
      {value && parents.length > 0 && (
        <button
          type="button"
          className="pf-button-secondary"
          onClick={() =>
            onChange({
              ...value,
              rules: [
                ...value.rules,
                { question: parents[0].code, operator: "in", values: [] },
              ],
            })
          }
        >
          Aggiungi condizione
        </button>
      )}
      <p className="pf-muted">
        Puoi collegare solo domande precedenti. Se una domanda viene saltata,
        anche i suoi rami vengono saltati.
      </p>
    </fieldset>
  );
}
