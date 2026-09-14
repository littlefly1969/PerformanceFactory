import type {
  StoredAreaConfigDraft,
  StoredSportAreaDraft,
  StoredTrainingDraft,
} from "./prompt-model";

const promptDraftStoragePrefix = "pf-ai-tuner-prompt-draft-v1";

export const sportAreaDraftKey = (
  sportId: string,
  specializationId: string,
  areaId: string,
) =>
  `${promptDraftStoragePrefix}:sport-area:${sportId}:${specializationId}:${areaId}`;

export const sportAreaDraftsKey = (
  sportId: string,
  specializationId: string,
  areaId: string,
) =>
  `${promptDraftStoragePrefix}:sport-area-drafts:${sportId}:${specializationId}:${areaId}`;

export const trainingDraftKey = (sportId: string, specializationId: string) =>
  `${promptDraftStoragePrefix}:training:${sportId}:${specializationId}`;

export const trainingDraftsKey = (sportId: string, specializationId: string) =>
  `${promptDraftStoragePrefix}:training-drafts:${sportId}:${specializationId}`;

export const areaConfigDraftsKey = (
  areaId: string,
  sportId?: string | null,
  specializationId?: string | null,
) =>
  sportId && specializationId
    ? `${promptDraftStoragePrefix}:area-config-drafts:${areaId}:${sportId}:${specializationId}`
    : `${promptDraftStoragePrefix}:area-config-drafts:${areaId}`;

const browserStorage = () =>
  typeof window === "undefined" ? null : window.localStorage;

const parseArray = (value: string | null): unknown[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const parseStoredSportAreaDrafts = (value: string | null) =>
  parseArray(value).filter(
    (item): item is StoredSportAreaDraft =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "name" in item &&
      "basePrompt" in item &&
      "updatedAt" in item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.basePrompt === "string" &&
      typeof item.updatedAt === "string",
  );

export const parseStoredAreaConfigDrafts = (value: string | null) =>
  parseArray(value).filter(
    (item): item is StoredAreaConfigDraft =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "name" in item &&
      "initialContext" in item &&
      "responseFormatPrompt" in item &&
      "questionnaireLayoutJson" in item &&
      "updatedAt" in item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.initialContext === "string" &&
      typeof item.responseFormatPrompt === "string" &&
      typeof item.updatedAt === "string",
  );

export const parseStoredTrainingDrafts = (value: string | null) =>
  parseArray(value).filter(
    (item): item is StoredTrainingDraft =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "name" in item &&
      "trainingPrompt" in item &&
      "updatedAt" in item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.trainingPrompt === "string" &&
      typeof item.updatedAt === "string",
  );

export const readStoredDraft = (key: string) =>
  browserStorage()?.getItem(key) ?? null;

export const writeStoredDraft = (key: string, value: string) => {
  browserStorage()?.setItem(key, value);
};

export const readStoredSportAreaDrafts = (key: string) =>
  parseStoredSportAreaDrafts(browserStorage()?.getItem(key) ?? null);

export const writeStoredSportAreaDrafts = (
  key: string,
  drafts: StoredSportAreaDraft[],
) => {
  browserStorage()?.setItem(key, JSON.stringify(drafts));
};

export const readStoredAreaConfigDrafts = (key: string) =>
  parseStoredAreaConfigDrafts(browserStorage()?.getItem(key) ?? null);

export const writeStoredAreaConfigDrafts = (
  key: string,
  drafts: StoredAreaConfigDraft[],
) => {
  browserStorage()?.setItem(key, JSON.stringify(drafts));
};

export const readStoredTrainingDrafts = (key: string) =>
  parseStoredTrainingDrafts(browserStorage()?.getItem(key) ?? null);

export const writeStoredTrainingDrafts = (
  key: string,
  drafts: StoredTrainingDraft[],
) => {
  browserStorage()?.setItem(key, JSON.stringify(drafts));
};

export const removeStoredDraft = (key: string) => {
  browserStorage()?.removeItem(key);
};

export const makeHistoryDraftId = (now = Date.now()) => `previous-${now}`;
