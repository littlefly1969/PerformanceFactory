import { BadRequestException } from '@nestjs/common';

export type DiscoverySportMode = 'fixed' | 'user_choice';

/** In modalità fixed sport e specializzazione sono risolti dal server e restano fuori da /start. */
export function discoverySportMode(): DiscoverySportMode {
  return process.env.PF4_SPORT_MODE === 'user_choice' ? 'user_choice' : 'fixed';
}

type StructureTemplate = {
  orderIndex: number;
  isActive: boolean;
  optionsJson: unknown;
};

const TARGETS = {
  sportId: 'lo sport',
  specializationId: 'la specializzazione',
  goalId: "l'obiettivo",
} as const;

export const discoveryTarget = (template: { optionsJson: unknown }) =>
  (template.optionsJson as { target?: string } | null)?.target;

/**
 * Invarianti che il percorso pubblico pretende: una sola domanda per target,
 * obiettivo sempre presente e, con sport a scelta, sport prima della
 * specializzazione. Un salvataggio admin non puo lasciare /start non configurata.
 */
export function assertDiscoveryStructure(
  templates: StructureTemplate[],
  mode = discoverySportMode(),
) {
  const active = templates
    .filter((t) => t.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  for (const [target, label] of Object.entries(TARGETS)) {
    const count = active.filter((t) => discoveryTarget(t) === target).length;
    if (count > 1)
      throw new BadRequestException(
        `Può esserci una sola domanda attiva per ${label}`,
      );
    const required = mode === 'user_choice' || target === 'goalId';
    if (required && !count)
      throw new BadRequestException(
        `La discovery richiede una domanda attiva per ${label}`,
      );
  }
  if (
    mode === 'user_choice' &&
    active.findIndex((t) => discoveryTarget(t) === 'sportId') >
      active.findIndex((t) => discoveryTarget(t) === 'specializationId')
  )
    throw new BadRequestException(
      'Lo sport deve precedere la specializzazione',
    );
}
