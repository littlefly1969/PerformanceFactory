import type { DiscoveryOption, DiscoveryQuestion } from "./discovery-types";

export function DiscoveryQuestionRenderer({
  question,
  value,
  options,
  onChange,
}: {
  question: DiscoveryQuestion;
  value: unknown;
  options: DiscoveryOption[];
  onChange: (value: unknown) => void;
}) {
  if (question.type === "date")
    return (
      <div className="pf4-number">
        <label htmlFor={question.id}>{question.title}</label>
        <input
          id={question.id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  if (question.type === "number" || question.type === "scale") {
    const current = typeof value === "number" ? value : undefined;
    const step = question.step ?? 1;
    const decimals = String(step).split(".")[1]?.length ?? 0;
    const nudge = (direction: 1 | -1) => {
      const base = current ?? question.min ?? 0;
      const next =
        current === undefined
          ? base
          : Number((base + direction * step).toFixed(decimals));
      onChange(
        Math.min(
          question.max ?? Infinity,
          Math.max(question.min ?? -Infinity, next),
        ),
      );
    };
    return (
      <div className="pf4-number pf4-stepper">
        <label htmlFor={question.id} className="pf4-sr">
          {question.title}
        </label>
        <div>
          <button
            type="button"
            aria-label="Diminuisci"
            disabled={
              current !== undefined &&
              question.min !== undefined &&
              current <= question.min
            }
            onClick={() => nudge(-1)}
          >
            −
          </button>
          <input
            id={question.id}
            type="number"
            inputMode="decimal"
            min={question.min}
            max={question.max}
            step={step}
            value={current ?? ""}
            placeholder="—"
            onChange={(e) =>
              onChange(
                e.target.value === "" ? undefined : e.target.valueAsNumber,
              )
            }
          />
          <button
            type="button"
            aria-label="Aumenta"
            disabled={
              current !== undefined &&
              question.max !== undefined &&
              current >= question.max
            }
            onClick={() => nudge(1)}
          >
            +
          </button>
        </div>
        {(question.min !== undefined || question.max !== undefined) && (
          <small>
            {question.min !== undefined && `Min ${question.min}`}
            {question.min !== undefined && question.max !== undefined && " · "}
            {question.max !== undefined && `Max ${question.max}`}
            {question.ui?.unit && ` ${question.ui.unit}`}
          </small>
        )}
      </div>
    );
  }
  const multiple = question.type === "multi_choice";
  return (
    <div
      className={`pf4-options ${question.ui?.presentation === "cards" ? "pf4-cards" : ""}`}
      style={{
        gridTemplateColumns: `repeat(${question.ui?.columns ?? 1}, minmax(0, 1fr))`,
      }}
      role="group"
      aria-label={question.title}
    >
      {options.map((option) => {
        const optionValue =
          question.type === "boolean" ? option.value : option.id;
        const selected = multiple
          ? Array.isArray(value) && value.includes(optionValue)
          : value === optionValue;
        return (
          <button
            type="button"
            key={option.id}
            className={`pf4-option ${selected ? "is-selected" : ""}`}
            aria-pressed={selected}
            onClick={() =>
              onChange(
                multiple
                  ? selected
                    ? (value as unknown[]).filter((v) => v !== optionValue)
                    : option.exclusive
                      ? [optionValue]
                      : [
                          ...(Array.isArray(value) ? value : []).filter(
                            (v) =>
                              !options.some((o) => o.exclusive && o.id === v),
                          ),
                          optionValue,
                        ]
                  : optionValue,
              )
            }
          >
            <span>
              {option.label}
              {option.description && <small>{option.description}</small>}
            </span>
            <span
              className={`pf4-dot ${multiple ? "pf4-square" : ""}`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
