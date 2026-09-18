export type DiscoveryOption = {
  id: string;
  label: string;
  description?: string;
  value: string | number | boolean;
  parentId?: string;
};
export type DiscoveryQuestion = {
  id: string;
  code: string;
  type:
    | 'single_choice'
    | 'multi_choice'
    | 'scale'
    | 'number'
    | 'boolean'
    | 'date';
  title: string;
  description?: string;
  required: boolean;
  order: number;
  target?: 'sportId' | 'specializationId' | 'goalId';
  dependsOn?: 'sportId';
  options: DiscoveryOption[];
  contextKey?: string;
  min?: number;
  max?: number;
  step?: number;
  ui?: {
    presentation?: 'cards' | 'compact_cards' | 'scale';
    columns?: number;
    unit?: string;
  };
};
export type DiscoveryConfiguration = {
  version: number;
  questions: DiscoveryQuestion[];
};
export type DiscoveryDraft = {
  version: number;
  currentStep: string;
  sportId?: string;
  specializationId?: string;
  goalId?: string;
  answers: Record<string, unknown>;
};
