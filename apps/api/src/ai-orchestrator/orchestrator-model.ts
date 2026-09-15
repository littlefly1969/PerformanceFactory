export const DEFAULT_SCALE = {
  minScore: 0,
  maxScore: 100,
  potentialStep: 5,
  thresholdRatio: 0.85,
};

export const DEFAULT_TRAINING_ANSWER_OPTIONS = [
  { label: 'Non completato', score: 0 },
  { label: 'Parziale', score: 50 },
  { label: 'Completato', score: 80 },
  { label: 'Completato bene', score: 100 },
];

export const RECENT_HISTORY_CYCLES = 3;

export type AreaRecord = {
  id: string;
  name: string;
};

export type SnapshotAreaHistoryItem = {
  areaId: string;
  realR: number;
  potentialP: number;
};
