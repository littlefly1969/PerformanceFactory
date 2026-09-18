export type ConsentDocument = {
  type: string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};
export type Driver = {
  id: string;
  name: string;
  current: number;
  potential: number;
  gap: number;
};
export type Journey = {
  phase:
    | "CONSENTS"
    | "ASSESSMENT_INTRO"
    | "ASSESSMENT"
    | "PROCESSING"
    | "RESULT"
    | "DURATION"
    | "COMPLETE";
  nextStep: string;
  currentQuestion: number;
  count: number;
  estimatedMinutes: number;
  documents?: ConsentDocument[];
  driverList: { id: string; name: string; count: number }[];
  answers: Record<string, string | number>;
  questions: {
    id: string;
    title: string;
    areaId: string;
    areaName: string;
    options: { value: string | number; label: string }[];
  }[];
  result: {
    snapshotId: string;
    current: number;
    potential: number;
    gap: number;
    drivers: Driver[];
    priority: Driver;
  } | null;
  durationOptions: { weeks: number; label: string; description: string }[];
  programDurationWeeks: number | null;
};
