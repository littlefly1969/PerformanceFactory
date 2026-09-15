"use client";

import { areaDisplayName } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";

export function renderSportSelectors(
  model: PromptManagementModel,
  includeArea: boolean,
) {
  const {
    busyKey,
    selectedSportId,
    setSelectedSportId,
    selectedSpecializationId,
    setSelectedSpecializationId,
    selectedAreaId,
    setSelectedAreaId,
    areas,
    sports,
    selectedSport,
    selectedSpecialization,
    updateSportAreaEnabled,
  } = model;

  return (
    <section className="pf-panel">
      <div className="pf-panel-header">
        <div>
          <h2>Contesto del prompt</h2>
          <p className="pf-muted">
            Seleziona sport, specializzazione e area per modificare il prompt
            corretto.
          </p>
        </div>
      </div>
      <div className="pf-stack">
        <div className="pf-two-col">
          <label className="pf-field">
            Sport
            <select
              className="pf-select"
              value={selectedSportId}
              onChange={(event) => setSelectedSportId(event.target.value)}
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            Specializzazione
            <select
              className="pf-select"
              value={selectedSpecializationId}
              onChange={(event) =>
                setSelectedSpecializationId(event.target.value)
              }
            >
              {(selectedSport?.specializations ?? []).map((specialization) => (
                <option key={specialization.id} value={specialization.id}>
                  {specialization.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {includeArea && (
          <>
            <div className="pf-grid">
              {areas.map((area) => {
                const areaPrompt = selectedSpecialization?.prompts.find(
                  (prompt) => prompt.areaId === area.id,
                );
                const areaEnabled = areaPrompt?.isEnabledDriver ?? true;
                const isSelected = selectedAreaId === area.id;
                return (
                  <div
                    key={area.id}
                    className={`pf-config-row pf-area-selector-card ${
                      isSelected ? "selected" : ""
                    }`}
                    style={{
                      borderColor: isSelected ? "var(--pf-accent)" : undefined,
                    }}
                  >
                    <button
                      type="button"
                      className="pf-area-selector-main"
                      onClick={() => setSelectedAreaId(area.id)}
                    >
                      <span>
                        <strong>{areaDisplayName(area.name)}</strong>
                        <small>
                          {areaEnabled
                            ? "Area attiva nella valutazione"
                            : "Area esclusa dalla valutazione"}
                        </small>
                      </span>
                    </button>
                    <div className="pf-area-toggle-group">
                      <button
                        type="button"
                        className={`pf-area-toggle-button ${
                          !areaEnabled ? "active" : ""
                        }`}
                        disabled={
                          areaEnabled || busyKey === `area-toggle-${area.id}`
                        }
                        onClick={() => {
                          setSelectedAreaId(area.id);
                          void updateSportAreaEnabled(area.id, true);
                        }}
                      >
                        Attiva
                      </button>
                      <button
                        type="button"
                        className={`pf-area-toggle-button ${
                          areaEnabled ? "active" : ""
                        }`}
                        disabled={
                          !areaEnabled || busyKey === `area-toggle-${area.id}`
                        }
                        onClick={() => {
                          setSelectedAreaId(area.id);
                          void updateSportAreaEnabled(area.id, false);
                        }}
                      >
                        Disattiva
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
