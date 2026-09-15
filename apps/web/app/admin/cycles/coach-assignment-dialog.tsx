"use client";

import { displayUser } from "./admin-cycles-model";
import type { AdminCyclesModel } from "./use-admin-cycles";
export function CoachAssignmentDialog({ model }: { model: AdminCyclesModel }) {
  const {
    busyKey,
    coachAssignmentTarget,
    coachFilter,
    setCoachFilter,
    filteredCoachAssignmentProfessionals,
    closeCoachAssignmentModal,
    assignCoach,
  } = model;
  if (!coachAssignmentTarget) return null;
  return (
    <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
      <section className="pf-modal pf-assignment-modal">
        <div className="pf-panel-header">
          <div>
            <p className="pf-eyebrow">Assegnazione allenatore</p>
            <h2>Seleziona allenatore</h2>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={closeCoachAssignmentModal}
          >
            Chiudi
          </button>
        </div>

        <div className="pf-assignment-summary">
          <div>
            <span>Utente</span>
            <strong>{displayUser(coachAssignmentTarget.athlete)}</strong>
          </div>
          <div>
            <span>Sport-specializzazione</span>
            <strong>{coachAssignmentTarget.label}</strong>
          </div>
          <div>
            <span>Attualmente assegnato</span>
            <strong>
              {coachAssignmentTarget.athlete.trainingState.linkedCoach?.email ??
                "Nessun allenatore"}
            </strong>
          </div>
        </div>

        <label className="pf-field pf-combobox-field">
          Allenatore
          <input
            className="pf-input"
            value={coachFilter}
            onChange={(event) => setCoachFilter(event.target.value)}
            placeholder="Cerca per nome o email"
            role="combobox"
            aria-controls="coach-assignment-options"
            aria-expanded="true"
            aria-autocomplete="list"
            autoFocus
            autoComplete="off"
          />
        </label>

        <div
          className="pf-combobox-menu"
          id="coach-assignment-options"
          role="listbox"
        >
          {filteredCoachAssignmentProfessionals.map((professional) => (
            <button
              key={professional.id}
              className={`pf-combobox-option ${
                coachAssignmentTarget.athlete.trainingState.linkedCoach?.id ===
                professional.id
                  ? "selected"
                  : ""
              }`}
              type="button"
              role="option"
              aria-selected={
                coachAssignmentTarget.athlete.trainingState.linkedCoach?.id ===
                professional.id
              }
              disabled={
                busyKey ===
                `coach-link:${coachAssignmentTarget.athlete.id}:${coachAssignmentTarget.specializationId}`
              }
              onClick={() =>
                assignCoach(
                  coachAssignmentTarget.athlete.id,
                  coachAssignmentTarget.specializationId,
                  professional.id,
                )
              }
            >
              {displayUser(professional)}
            </button>
          ))}
          {!filteredCoachAssignmentProfessionals.length && (
            <div className="pf-alert warning">
              Nessun allenatore abilitato trovato per questa specializzazione.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
