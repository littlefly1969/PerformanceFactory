import { BadRequestException } from '@nestjs/common';

export const SPORT_OPTIONS = [
  { key: 'CYCLING', label: 'Ciclismo' },
  { key: 'RUNNING', label: 'Corsa' },
  { key: 'TENNIS', label: 'Tennis' },
  { key: 'PADEL', label: 'Padel' },
  { key: 'FITNESS', label: 'Fitness' },
] as const;

export const FITNESS_LOCATION_OPTIONS = [
  { key: 'HOME', label: 'In casa' },
  { key: 'GYM', label: 'In palestra' },
  { key: 'MIXED', label: 'Misto' },
] as const;

export type SportKey = (typeof SPORT_OPTIONS)[number]['key'];
export type FitnessLocationKey = (typeof FITNESS_LOCATION_OPTIONS)[number]['key'];

export type SportSelectionInput = {
  sports?: string[];
  fitnessLocation?: string | null;
};

export type NormalizedSportSelection = {
  sports: SportKey[];
  fitnessLocation: FitnessLocationKey | null;
};

const sportKeys = new Set<string>(SPORT_OPTIONS.map((sport) => sport.key));
const fitnessLocationKeys = new Set<string>(
  FITNESS_LOCATION_OPTIONS.map((location) => location.key),
);

export function normalizeSportSelection(
  input: SportSelectionInput,
): NormalizedSportSelection {
  const sports = Array.from(
    new Set((input.sports ?? []).map((sport) => sport.trim().toUpperCase())),
  );
  if (!sports.length) {
    throw new BadRequestException('Seleziona almeno uno sport');
  }
  if (sports.length > 2) {
    throw new BadRequestException('Puoi selezionare al massimo due sport');
  }
  if (sports.some((sport) => !sportKeys.has(sport))) {
    throw new BadRequestException('Sport non valido');
  }
  const fitnessSelected = sports.includes('FITNESS');
  const fitnessLocation = input.fitnessLocation?.trim().toUpperCase() || null;
  if (fitnessSelected && !fitnessLocation) {
    throw new BadRequestException('Se scegli fitness indica casa, palestra o misto');
  }
  if (fitnessLocation && !fitnessLocationKeys.has(fitnessLocation)) {
    throw new BadRequestException('Contesto fitness non valido');
  }
  if (!fitnessSelected && fitnessLocation) {
    throw new BadRequestException(
      'Il contesto fitness si usa solo quando scegli fitness',
    );
  }
  return {
    sports: sports as SportKey[],
    fitnessLocation: fitnessSelected
      ? (fitnessLocation as FitnessLocationKey)
      : null,
  };
}

export function formatSportSelection(selection: NormalizedSportSelection) {
  const sportLabels = selection.sports.map(
    (sport) => SPORT_OPTIONS.find((item) => item.key === sport)?.label ?? sport,
  );
  const fitnessLabel = selection.fitnessLocation
    ? FITNESS_LOCATION_OPTIONS.find(
        (item) => item.key === selection.fitnessLocation,
      )?.label
    : null;
  return {
    sports: selection.sports,
    fitnessLocation: selection.fitnessLocation,
    sportLabels,
    fitnessLocationLabel: fitnessLabel ?? null,
    label: fitnessLabel
      ? `${sportLabels.join(', ')} (${fitnessLabel})`
      : sportLabels.join(', '),
  };
}
