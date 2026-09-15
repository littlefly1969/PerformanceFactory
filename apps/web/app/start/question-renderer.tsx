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
  if (question.type === "number" || question.type === "scale")
    return (
      <div className="pf4-number">
        <label htmlFor={question.id} className="pf4-sr">
          {question.title}
        </label>
        <div>
          <input
            id={question.id}
            type="number"
            inputMode="decimal"
            min={question.min}
            max={question.max}
            step={question.step ?? 1}
            value={typeof value === "number" ? value : ""}
            placeholder="—"
            onChange={(e) =>
              onChange(
                e.target.value === "" ? undefined : e.target.valueAsNumber,
              )
            }
          />
          <span>{question.ui?.unit}</span>
        </div>
        {question.type === "scale" && (
          <input
            aria-label={`${question.title} — scala`}
            type="range"
            min={question.min ?? 0}
            max={question.max ?? 10}
            step={question.step ?? 1}
            value={typeof value === "number" ? value : (question.min ?? 0)}
            onChange={(e) => onChange(e.target.valueAsNumber)}
          />
        )}
        <small>
          {question.min !== undefined && `Min ${question.min}`}{" "}
          {question.max !== undefined && `· Max ${question.max}`}
        </small>
      </div>
    );
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
                    : [...(Array.isArray(value) ? value : []), optionValue]
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
