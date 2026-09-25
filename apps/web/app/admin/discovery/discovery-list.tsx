import { useState } from "react";
import {
  inPublicPath,
  isSportTarget,
  TARGET_LABELS,
  TYPE_LABELS,
  type SportMode,
  type Template,
} from "./discovery-types";

export function DiscoveryList({
  templates,
  sportMode,
  busy,
  onMove,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  templates: Template[];
  sportMode: SportMode;
  busy: boolean;
  onMove: (from: number, to: number) => void;
  onEdit: (template: Template) => void;
  onDuplicate: (template: Template) => void;
  onToggle: (template: Template) => void;
  onDelete: (template: Template) => void;
}) {
  const [dragged, setDragged] = useState<number>();
  return (
    <ol className="pf-stack" aria-label="Domande discovery">
      {templates.map((t, index) => {
        const target = t.optionsJson.target;
        return (
          <li
            key={t.id ?? t.key}
            className="pf-card"
            draggable={!busy}
            aria-label={t.label}
            onDragStart={(event) => {
              // Firefox avvia il trascinamento solo con un dato associato.
              event.dataTransfer?.setData("text/plain", t.key);
              setDragged(index);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== undefined && dragged !== index)
                onMove(dragged, index);
              setDragged(undefined);
            }}
          >
            <p className="pf-muted">
              <span aria-hidden="true">☰ </span>
              {String(index + 1).padStart(2, "0")} ·{" "}
              {TYPE_LABELS[t.optionsJson.type]} ·{" "}
              {t.required ? "Obbligatoria" : "Facoltativa"}
              {t.optionsJson.visibleWhen && " · Condizionale"}
              {target && ` · ${TARGET_LABELS[target]}`}
              {" · "}
              {t.isActive
                ? inPublicPath(t, sportMode)
                  ? "Attiva"
                  : "Attiva, fuori dal percorso con sport fisso"
                : "Disattivata"}
            </p>
            <h2>{t.label}</h2>
            <p className="pf-muted">
              <code>{t.key}</code>
              {t.optionsJson.contextKey && (
                <>
                  {" · contesto "}
                  <code>{t.optionsJson.contextKey}</code>
                </>
              )}
            </p>
            <div className="pf-actions">
              <label>
                Posizione{" "}
                <select
                  aria-label={`Posizione di ${t.label}`}
                  value={index}
                  disabled={busy}
                  onChange={(e) => onMove(index, Number(e.target.value))}
                >
                  {templates.map((_, position) => (
                    <option key={position} value={position}>
                      {position + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="pf-button-secondary"
                disabled={busy}
                onClick={() => onEdit(t)}
              >
                Modifica <span className="sr-only">{t.label}</span>
              </button>
              {/* Sport e specializzazione prendono le opzioni dal catalogo: non si duplicano. */}
              {!isSportTarget(t) && (
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busy}
                  onClick={() => onDuplicate(t)}
                >
                  Duplica <span className="sr-only">{t.label}</span>
                </button>
              )}
              <button
                type="button"
                className="pf-button-secondary"
                disabled={busy}
                onClick={() => onToggle(t)}
              >
                {t.isActive ? "Disattiva" : "Attiva"}{" "}
                <span className="sr-only">{t.label}</span>
              </button>
              <button
                type="button"
                className="pf-button-danger"
                disabled={busy}
                onClick={() => onDelete(t)}
              >
                Elimina <span className="sr-only">{t.label}</span>
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
