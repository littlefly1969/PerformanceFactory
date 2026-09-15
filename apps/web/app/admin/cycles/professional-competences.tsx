"use client";

import type { AdminCyclesModel } from "./use-admin-cycles";
export function ProfessionalCompetences({
  model,
}: {
  model: AdminCyclesModel;
}) {
  const {
    dashboard,
    busyKey,
    competencesByProfessional,
    setCompetencesByProfessional,
    coachCompetencesByProfessional,
    setCoachCompetencesByProfessional,
    professionals,
    areas,
    saveCompetences,
    saveCoachCompetences,
  } = model;
  return (
    <section className="pf-panel">
      <div className="pf-panel-header">
        <div>
          <h2>Competenze professionisti</h2>
          <p className="pf-muted">
            L'instradamento delle approvazioni usa le competenze per area.
            Mantienilo esplicito e visibile.
          </p>
        </div>
      </div>
      <div className="pf-grid">
        {professionals.map((professional) => (
          <article key={professional.id} className="pf-card">
            <div className="pf-card-top">
              <div>
                <h3>{professional.email}</h3>
                <p className="pf-muted">
                  {professional.professionalLinks.length} atleti collegati
                </p>
              </div>
            </div>
            <div className="pf-checkbox-grid">
              {areas.map((area) => (
                <label key={area.id} className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      competencesByProfessional[professional.id]?.[area.id],
                    )}
                    onChange={(event) =>
                      setCompetencesByProfessional((prev) => ({
                        ...prev,
                        [professional.id]: {
                          ...(prev[professional.id] ?? {}),
                          [area.id]: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{area.name}</span>
                </label>
              ))}
            </div>
            <button
              className="pf-button-secondary"
              type="button"
              disabled={busyKey === `competences:${professional.id}`}
              onClick={() => saveCompetences(professional.id)}
            >
              Salva aree
            </button>
            <div className="pf-divider" />
            <p className="pf-muted">Competenze allenatore</p>
            <div className="pf-checkbox-grid">
              {(dashboard?.sports ?? []).flatMap((sport) =>
                sport.specializations.map((specialization) => (
                  <label key={specialization.id} className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        coachCompetencesByProfessional[professional.id]?.[
                          specialization.id
                        ],
                      )}
                      onChange={(event) =>
                        setCoachCompetencesByProfessional((prev) => ({
                          ...prev,
                          [professional.id]: {
                            ...(prev[professional.id] ?? {}),
                            [specialization.id]: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>
                      {sport.label} - {specialization.label}
                    </span>
                  </label>
                )),
              )}
            </div>
            <button
              className="pf-button-secondary"
              type="button"
              disabled={busyKey === `coach-competences:${professional.id}`}
              onClick={() => saveCoachCompetences(professional.id)}
            >
              Salva allenatore
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
