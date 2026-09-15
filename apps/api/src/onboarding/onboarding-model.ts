import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  UserRole,
} from '@prisma/client';

export type Actor = {
  id: string;
  role: UserRole;
};

export const STARTER_OPTIONS = [
  { value: 20, label: 'Critico' },
  { value: 40, label: 'Fragile' },
  { value: 60, label: 'Stabile' },
  { value: 80, label: 'Forte' },
  { value: 100, label: 'Elite' },
];

export const SPECIALIST_SCORE_OPTIONS = [
  { value: 1, label: '1', score: 20 },
  { value: 2, label: '2', score: 40 },
  { value: 3, label: '3', score: 60 },
  { value: 4, label: '4', score: 80 },
  { value: 5, label: '5', score: 100 },
];

export type TemplateRecord = {
  id: string;
  key: string;
  scope: OnboardingQuestionScope;
  areaId: string | null;
  label: string;
  helpText: string | null;
  inputType: OnboardingInputType;
  optionsJson: Prisma.JsonValue;
  required: boolean;
  orderIndex: number;
  area: { id: string; name: string } | null;
};

export type OnboardingAnswer = {
  questionId: string;
  value: string | number | boolean | null;
};

export type GoalChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SportSelectionPayload = {
  sportId?: string;
  specializationId?: string;
};

export type FormattedSportSelection = {
  sportId: string;
  sportKey: string;
  sportLabel: string;
  specializationId: string;
  specializationKey: string;
  specializationLabel: string;
  label: string;
};
