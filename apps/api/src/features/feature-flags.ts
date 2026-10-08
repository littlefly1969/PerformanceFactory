import { createHash } from 'crypto';

/**
 * Funzioni rilasciabili per gradi: prima ai beta tester, poi a una percentuale
 * stabile di utenti, poi a tutti. Le chiavi vivono nel codice, lo stato nel
 * database: un flag nuovo nasce spento.
 */
export const FEATURE_FLAG_REGISTRY = [
  {
    key: 'referral_share',
    description:
      'Mostra all’atleta il suo link personale per invitare un compagno (A8.19).',
  },
  {
    key: 'free_lesson',
    description:
      'Lezione gratuita al circolo con crediti di interazione e micro-test durante la calibrazione (A4.8, A7.2).',
  },
  {
    key: 'potential_scenarios',
    description:
      'A calibrazione chiusa mostra P3/P6/P12 e la scelta del percorso di 3, 6 o 12 mesi (1.8-1.9).',
  },
  {
    key: 'ai_micro_tests',
    description:
      'Micro-test scritti dall’AI come passo della calibrazione; spento, il motore propone solo domande. Il catalogo del back office non li sostituisce.',
  },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_REGISTRY)[number]['key'];

export type FeatureFlagState = {
  key: string;
  enabled: boolean;
  betaTesters: boolean;
  rolloutPercent: number;
};

export type FeatureAudience = { userId: string; isBetaTester: boolean } | null;

/** Bucket 0-99 stabile per utente e flag: lo stesso utente resta dentro o fuori. */
export function rolloutBucket(key: string, userId: string) {
  const digest = createHash('sha256').update(`${key}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function isFeatureEnabled(
  flag: FeatureFlagState,
  audience: FeatureAudience,
) {
  if (!flag.enabled) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (!audience) return false;
  if (flag.betaTesters && audience.isBetaTester) return true;
  return rolloutBucket(flag.key, audience.userId) < flag.rolloutPercent;
}
