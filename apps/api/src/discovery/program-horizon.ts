import { ProgramHorizon } from '@prisma/client';

/**
 * Orizzonti del programma (Blueprint A5): 3, 6 o 12 mesi, al posto delle
 * vecchie durate di 4, 12 e 52 settimane. Il motore di training lavora a
 * finestre di 14 giorni, quindi ogni orizzonte è un numero pari di settimane.
 */
export const PROGRAM_HORIZON_WEEKS: Record<ProgramHorizon, number> = {
  PROGRAM_3M: 12,
  PROGRAM_6M: 26,
  PROGRAM_12M: 52,
};

export const PROGRAM_WEEKS = [12, 26, 52] as const;
export type ProgramWeeks = (typeof PROGRAM_WEEKS)[number];

export const isProgramWeeks = (value: unknown): value is ProgramWeeks =>
  (PROGRAM_WEEKS as readonly unknown[]).includes(value);

export const horizonForWeeks = (weeks: number): ProgramHorizon | null =>
  (Object.entries(PROGRAM_HORIZON_WEEKS).find(([, w]) => w === weeks)?.[0] as
    | ProgramHorizon
    | undefined) ?? null;

export const PROGRAM_DURATIONS = [
  {
    weeks: 12,
    label: '3 mesi',
    description: 'Un primo ciclo per costruire continuità sui tuoi driver.',
  },
  {
    weeks: 26,
    label: '6 mesi',
    description: 'Il tempo per consolidare i miglioramenti.',
  },
  { weeks: 52, label: '12 mesi', description: 'Un percorso di lungo periodo.' },
];
