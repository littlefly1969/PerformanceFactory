import { moveItem } from "../discovery/discovery-types";

export type OptionField<T> = {
  key: keyof T & string;
  label: string;
  type?: "text" | "number";
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Converte il testo del campo nel valore salvato. */
  parse?: (raw: string) => unknown;
  disabled?: (option: T) => boolean;
};

/**
 * Editor delle opzioni condiviso da Discovery e Assessment: stessi campi in
 * colonna, stesso ordinamento con Sposta su/giù, stessa aggiunta e rimozione.
 */
export function OptionListEditor<T>({
  legend,
  options,
  fields,
  minItems = 1,
  create,
  labelOf,
  onChange,
}: {
  legend: string;
  options: T[];
  fields: OptionField<T>[];
  minItems?: number;
  create: (index: number) => T;
  labelOf: (option: T) => string;
  onChange: (next: T[]) => void;
}) {
  const set = (index: number, key: keyof T, value: unknown) =>
    onChange(options.map((o, i) => (i === index ? { ...o, [key]: value } : o)));
  return (
    <fieldset className="pf-stack">
      <legend>{legend}</legend>
      {options.map((option, index) => (
        <fieldset className="pf-stack" key={index}>
          <legend>Opzione {index + 1}</legend>
          {fields.map((field) => (
            <label className="pf-field" key={field.key}>
              {field.label}
              <input
                className="pf-input"
                type={field.type ?? "text"}
                step={field.type === "number" ? "any" : undefined}
                required={field.required}
                maxLength={field.maxLength}
                min={field.min}
                max={field.max}
                placeholder={field.placeholder}
                disabled={field.disabled?.(option)}
                value={String(option[field.key] ?? "")}
                onChange={(e) =>
                  set(
                    index,
                    field.key,
                    field.parse ? field.parse(e.target.value) : e.target.value,
                  )
                }
              />
            </label>
          ))}
          <div className="pf-actions">
            <button
              type="button"
              className="pf-button-secondary"
              disabled={index === 0}
              onClick={() => onChange(moveItem(options, index, index - 1))}
            >
              Sposta su <span className="sr-only">{labelOf(option)}</span>
            </button>
            <button
              type="button"
              className="pf-button-secondary"
              disabled={index === options.length - 1}
              onClick={() => onChange(moveItem(options, index, index + 1))}
            >
              Sposta giù <span className="sr-only">{labelOf(option)}</span>
            </button>
            <button
              type="button"
              className="pf-button-secondary"
              disabled={options.length <= minItems}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
            >
              Rimuovi <span className="sr-only">{labelOf(option)}</span>
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="pf-button-secondary"
        onClick={() => onChange([...options, create(options.length)])}
      >
        Aggiungi opzione
      </button>
    </fieldset>
  );
}
