"use client";

import { allFilterValue } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";

export function renderSportFilterControls(
  model: PromptManagementModel,
  params: {
    selectedSportId: string | null;
    selectedSpecializationId: string | null;
    onSportChange: (sportId: string, specializationId: string) => void;
  },
) {
  const { sports } = model;

  const filterSportId = params.selectedSportId ?? allFilterValue;
  const filterSpecializationId =
    params.selectedSpecializationId ?? allFilterValue;
  const filterSport =
    filterSportId !== allFilterValue
      ? (sports.find((sport) => sport.id === filterSportId) ?? null)
      : null;
  const specializationOptions = filterSport
    ? filterSport.specializations.map((specialization) => ({
        sport: filterSport,
        specialization,
      }))
    : sports.flatMap((sport) =>
        sport.specializations.map((specialization) => ({
          sport,
          specialization,
        })),
      );

  return (
    <div className="pf-two-col">
      <label className="pf-field">
        Sport
        <select
          className="pf-select"
          value={filterSportId}
          onChange={(event) => {
            const nextSportId = event.target.value;
            params.onSportChange(
              nextSportId,
              nextSportId === allFilterValue
                ? allFilterValue
                : filterSpecializationId,
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
          value={filterSpecializationId}
          onChange={(event) =>
            params.onSportChange(filterSportId, event.target.value)
          }
          disabled={specializationOptions.length === 0}
        >
          <option value={allFilterValue}>Tutti</option>
          {specializationOptions.map(({ sport, specialization }) => (
            <option
              key={`${sport.id}:${specialization.id}`}
              value={specialization.id}
            >
              {filterSport
                ? specialization.label
                : `${specialization.label} - ${sport.label}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
