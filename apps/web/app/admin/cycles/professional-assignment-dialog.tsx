"use client";

import { displayUser } from "./admin-cycles-model";
import type { AdminCyclesModel } from "./use-admin-cycles";
export function ProfessionalAssignmentDialog({
  model,
}: {
  model: AdminCyclesModel;
}) {
  const {
    busyKey,
    assignmentTarget,
    professionalFilter,
    setProfessionalFilter,
    filteredAssignmentProfessionals,
    closeAssignmentModal,
    assignProfessional,
  } = model;
  if (!assignmentTarget) return null;
  return (
    <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
      <section className="pf-modal pf-assignment-modal">
        <div className="pf-panel-header">
          <div>
            <p className="pf-eyebrow">Assegnazione area</p>
            <h2>Seleziona professionista</h2>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={closeAssignmentModal}
          >
            Chiudi
          </button>
        </div>

        <div className="pf-assignment-summary">
          <div>
            <span>Utente</span>
            <strong>{displayUser(assignmentTarget.athlete)}</strong>
          </div>
          <div>
            <span>Zona driver</span>
            <strong>{assignmentTarget.state.area.name}</strong>
          </div>
          <div>
            <span>Attualmente assegnato</span>
            <strong>
              {assignmentTarget.state.linkedProfessional?.email ??
                "Nessun professionista"}
            </strong>
          </div>
        </div>

        <label className="pf-field pf-combobox-field">
          Professionista
          <input
            className="pf-input"
            value={professionalFilter}
            onChange={(event) => setProfessionalFilter(event.target.value)}
            placeholder="Cerca per nome o email"
            role="combobox"
            aria-expanded="true"
            aria-controls="professional-assignment-options"
            autoFocus
            autoComplete="off"
          />
        </label>

        <div className="pf-combobox-menu" id="professional-assignment-options">
          {filteredAssignmentProfessionals.map((professional) => (
            <button
              key={professional.id}
              className={`pf-combobox-option ${
                assignmentTarget.state.linkedProfessional?.id ===
                professional.id
                  ? "selected"
                  : ""
              }`}
              type="button"
              disabled={
                busyKey ===
                `link:${assignmentTarget.athlete.id}:${assignmentTarget.state.area.id}`
              }
              onClick={() =>
                assignProfessional(
                  assignmentTarget.athlete.id,
                  assignmentTarget.state.area.id,
                  professional.id,
                )
              }
            >
              {displayUser(professional)}
            </button>
          ))}
          {!filteredAssignmentProfessionals.length && (
            <div className="pf-alert warning">
              Nessun professionista abilitato trovato per questa area.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
