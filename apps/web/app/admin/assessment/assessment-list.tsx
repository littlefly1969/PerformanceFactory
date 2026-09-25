import {
  position,
  type AssessmentArea,
  type AssessmentList as List,
  type AssessmentQuestion,
} from "./assessment-types";

export function AssessmentList({
  list,
  busy,
  onEdit,
  onMove,
  onToggle,
  onDelete,
  onAdd,
}: {
  list: List;
  busy: boolean;
  onEdit: (question: AssessmentQuestion, area: AssessmentArea) => void;
  onMove: (area: AssessmentArea, from: number, to: number) => void;
  onToggle: (question: AssessmentQuestion) => void;
  onDelete: (question: AssessmentQuestion) => void;
  onAdd: (area: AssessmentArea) => void;
}) {
  return (
    <>
      <section className="pf-stack">
        <h2>Domande operative</h2>
        <ol className="pf-stack" aria-label="Domande operative">
          {list.operational.map((q, index) => (
            <li key={q.id} className="pf-card" aria-label={q.label}>
              <p className="pf-muted">{position(index)} · Sistema · Bloccata</p>
              <h3>{q.label}</h3>
              <p className="pf-muted">
                Questa domanda alimenta direttamente la programmazione degli
                allenamenti.
              </p>
              <p className="pf-muted">
                <code>{q.semanticRole}</code> ·{" "}
                {q.options.map((o) => o.label).join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      </section>
      <section className="pf-stack">
        <h2>Driver</h2>
        {list.areas.map((area) => {
          const active = area.templates.filter((t) => t.isActive).length;
          return (
            <section key={area.id} className="pf-stack" aria-label={area.name}>
              <h3>{area.name}</h3>
              <p className="pf-muted">
                {active} / {list.expectedPerArea} domande attive
              </p>
              <ol className="pf-stack">
                {area.templates.map((q, index) => (
                  <li key={q.id} className="pf-card" aria-label={q.label}>
                    <p className="pf-muted">
                      {position(index)} · Driver ·{" "}
                      {q.isActive ? "Attiva" : "Disattivata"}
                    </p>
                    <h4>{q.label}</h4>
                    <p className="pf-muted">
                      {q.options
                        .map((o) => `${o.label} (${o.score})`)
                        .join(" · ")}
                    </p>
                    <div className="pf-actions">
                      <button
                        type="button"
                        className="pf-button-secondary"
                        disabled={busy}
                        onClick={() => onEdit(q, area)}
                      >
                        Modifica <span className="sr-only">{q.label}</span>
                      </button>
                      <button
                        type="button"
                        className="pf-button-secondary"
                        disabled={busy || index === 0}
                        onClick={() => onMove(area, index, index - 1)}
                      >
                        Sposta su <span className="sr-only">{q.label}</span>
                      </button>
                      <button
                        type="button"
                        className="pf-button-secondary"
                        disabled={busy || index === area.templates.length - 1}
                        onClick={() => onMove(area, index, index + 1)}
                      >
                        Sposta giù <span className="sr-only">{q.label}</span>
                      </button>
                      <button
                        type="button"
                        className="pf-button-secondary"
                        disabled={busy}
                        onClick={() => onToggle(q)}
                      >
                        {q.isActive ? "Disattiva" : "Attiva"}{" "}
                        <span className="sr-only">{q.label}</span>
                      </button>
                      <button
                        type="button"
                        className="pf-button-danger"
                        disabled={busy}
                        onClick={() => onDelete(q)}
                      >
                        Elimina <span className="sr-only">{q.label}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="pf-button-secondary"
                disabled={busy}
                onClick={() => onAdd(area)}
              >
                Aggiungi domanda <span className="sr-only">{area.name}</span>
              </button>
            </section>
          );
        })}
      </section>
    </>
  );
}
