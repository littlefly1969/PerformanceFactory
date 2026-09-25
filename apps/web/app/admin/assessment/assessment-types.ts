export type AssessmentOption = {
  value: string;
  label: string;
  score: number | "";
};
export type AssessmentQuestion = {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  orderIndex: number;
  isActive: boolean;
  options: AssessmentOption[];
  semanticRole?: string;
};
export type AssessmentArea = {
  id: string;
  name: string;
  templates: AssessmentQuestion[];
};
/** Risposta di GET /admin/assessment-templates: i conteggi sono del backend. */
export type AssessmentList = {
  sportKey: string;
  expectedPerArea: number;
  operational: AssessmentQuestion[];
  areas: AssessmentArea[];
  stats: {
    fixedQuestionCount: number;
    areaQuestionCount: number;
    count: number;
    estimatedMinutes: number;
  };
  problems: string[];
};
export type AssessmentDraft = {
  id?: string;
  areaId: string;
  label: string;
  helpText: string;
  isActive: boolean;
  options: AssessmentOption[];
};
export const position = (index: number) => String(index + 1).padStart(2, "0");
