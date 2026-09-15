"use client";

import { EmptyState } from "@/app/components/product-shell";
import { allFilterValue } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";

export function renderSportContextPicker(
  model: PromptManagementModel,
  params: {
    title: string;
    description: string;
    selectedSportId: string | null;
    selectedSpecializationId: string | null;
    onSportChange: (sportId: string, specializationId: string) => void;
    onOpen: (sportId: string, specializationId: string) => void;
  },
) {
  const { sports, getFilteredSportContexts } = model;

  const pickerSportId = params.selectedSportId ?? allFilterValue;
  const pickerSpecializationId =
    params.selectedSpecializationId ?? allFilterValue;
  const pickerSport =
    pickerSportId !== allFilterValue
      ? (sports.find((sport) => sport.id === pickerSportId) ?? null)
      : null;
  const pickerSpecializations = pickerSport
    ? pickerSport.specializations.map((specialization) => ({
        sport: pickerSport,
        specialization,
      }))
    : sports.flatMap((sport) =>
        sport.specializations.map((specialization) => ({
          sport,
          specialization,
        })),
      );
  const filteredContexts = getFilteredSportContexts(
    pickerSportId,
    pickerSpecializationId,
  );

  return (
    <section className="pf-stack">
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>{params.title}</h2>
            <p className="pf-muted">{params.description}</p>
          </div>
        </div>

        {sports.length === 0 ? (
          <EmptyState
            title="Nessuno sport disponibile"
            description="Configura prima almeno uno sport e una specializzazione."
          />
        ) : (
          <div className="pf-stack">
            <div className="pf-two-col">
              <label className="pf-field">
                Sport
                <select
                  className="pf-select"
                  value={pickerSportId}
                  onChange={(event) => {
                    const nextSportId = event.target.value;
                    params.onSportChange(
                      nextSportId,
                      nextSportId === allFilterValue
                        ? allFilterValue
                        : pickerSpecializationId,
                    );
                  }}
                >
                  <option value={allFilterValue}>Tutti</option>
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
                  value={pickerSpecializationId}
                  onChange={(event) =>
                    params.onSportChange(pickerSportId, event.target.value)
                  }
                  disabled={pickerSpecializations.length === 0}
                >
                  <option value={allFilterValue}>Tutti</option>
                  {pickerSpecializations.map(({ sport, specialization }) => (
                    <option
                      key={`${sport.id}:${specialization.id}`}
                      value={specialization.id}
                    >
                      {pickerSport
                        ? specialization.label
                        : `${specialization.label} - ${sport.label}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredContexts.length === 0 ? (
              <EmptyState
                title="Nessun prompt filtrabile"
                description="Il filtro selezionato non contiene specializzazioni."
              />
            ) : (
              <div className="pf-actions">
                <button
                  type="button"
                  className="pf-button"
                  onClick={() =>
                    params.onOpen(pickerSportId, pickerSpecializationId)
                  }
                >
                  Apri prompt
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
