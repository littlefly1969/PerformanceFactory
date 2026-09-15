import type { Dispatch, SetStateAction } from "react";
import {
  allFilterValue,
  areaDisplayName,
  type Area,
  type PromptMode,
  type SportCatalogItem,
} from "./prompt-model";
export function createPromptHeader(state: {
  editorOpen: boolean;
  setEditorOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  promptListMode: PromptMode | null;
  areaConfigPromptListAreaId: string | null;
  areaConfigPromptListSportId: string | null;
  areaConfigPromptListSpecializationId: string | null;
  setAreaConfigPromptListAreaId: Dispatch<SetStateAction<string | null>>;
  setAreaConfigPromptListSpecializationId: Dispatch<
    SetStateAction<string | null>
  >;
  setAreaConfigPromptListSportId: Dispatch<SetStateAction<string | null>>;
  setAreaConfigEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setAreaConfigDraftId: Dispatch<SetStateAction<string | null>>;
  trainingPromptListSpecializationId: string | null;
  trainingPromptListSportId: string | null;
  setTrainingPromptListSpecializationId: Dispatch<
    SetStateAction<string | null>
  >;
  setTrainingPromptListSportId: Dispatch<SetStateAction<string | null>>;
  setTrainingEditorSource: Dispatch<SetStateAction<"active" | "draft" | "new">>;
  setTrainingDraftId: Dispatch<SetStateAction<string | null>>;
  sportAreaPromptListAreaId: string | null;
  sportAreaPromptListSportId: string | null;
  sportAreaPromptListSpecializationId: string | null;
  setSportAreaPromptListAreaId: Dispatch<SetStateAction<string | null>>;
  setSportAreaPromptListSpecializationId: Dispatch<
    SetStateAction<string | null>
  >;
  setSportAreaPromptListSportId: Dispatch<SetStateAction<string | null>>;
  setSportAreaEditorSource: Dispatch<
    SetStateAction<"active" | "draft" | "new">
  >;
  setSportAreaDraftId: Dispatch<SetStateAction<string | null>>;
  setPromptListMode: Dispatch<SetStateAction<PromptMode | null>>;
  getPromptOverview: (promptMode: PromptMode) => {
    title: string;
    description: string;
    where: string;
    version: string;
    updatedAt: string;
  };
  mode: PromptMode;
  editorDescription: string;
  areas: Area[];
  sports: SportCatalogItem[];
}) {
  const {
    editorOpen,
    setEditorOpen,
    setMessage,
    promptListMode,
    areaConfigPromptListAreaId,
    areaConfigPromptListSportId,
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListAreaId,
    setAreaConfigPromptListSpecializationId,
    setAreaConfigPromptListSportId,
    setAreaConfigEditorSource,
    setAreaConfigDraftId,
    trainingPromptListSpecializationId,
    trainingPromptListSportId,
    setTrainingPromptListSpecializationId,
    setTrainingPromptListSportId,
    setTrainingEditorSource,
    setTrainingDraftId,
    sportAreaPromptListAreaId,
    sportAreaPromptListSportId,
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListAreaId,
    setSportAreaPromptListSpecializationId,
    setSportAreaPromptListSportId,
    setSportAreaEditorSource,
    setSportAreaDraftId,
    setPromptListMode,
    getPromptOverview,
    mode,
    editorDescription,
    areas,
    sports,
  } = state;
  const promptBackAction = editorOpen
    ? {
        onClick: () => {
          setEditorOpen(false);
          setMessage(null);
        },
      }
    : promptListMode === "area-config" && areaConfigPromptListAreaId
      ? {
          onClick: () => {
            if (
              areaConfigPromptListSportId === allFilterValue &&
              areaConfigPromptListSpecializationId === allFilterValue
            ) {
              setAreaConfigPromptListAreaId(null);
            } else if (
              areaConfigPromptListSportId &&
              areaConfigPromptListSportId !== allFilterValue &&
              areaConfigPromptListSpecializationId &&
              areaConfigPromptListSpecializationId !== allFilterValue
            ) {
              setAreaConfigPromptListSpecializationId(allFilterValue);
            } else if (
              areaConfigPromptListSportId &&
              areaConfigPromptListSportId !== allFilterValue &&
              areaConfigPromptListSpecializationId === allFilterValue
            ) {
              setAreaConfigPromptListSportId(allFilterValue);
              setAreaConfigPromptListSpecializationId(allFilterValue);
            } else if (areaConfigPromptListSpecializationId) {
              setAreaConfigPromptListSportId(null);
              setAreaConfigPromptListSpecializationId(null);
            } else {
              setAreaConfigPromptListAreaId(null);
            }
            setAreaConfigEditorSource("active");
            setAreaConfigDraftId(null);
            setMessage(null);
          },
        }
      : promptListMode === "training" && trainingPromptListSpecializationId
        ? {
            onClick: () => {
              if (
                trainingPromptListSportId &&
                trainingPromptListSportId !== allFilterValue &&
                trainingPromptListSpecializationId &&
                trainingPromptListSpecializationId !== allFilterValue
              ) {
                setTrainingPromptListSpecializationId(allFilterValue);
              } else if (
                trainingPromptListSportId &&
                trainingPromptListSportId !== allFilterValue &&
                trainingPromptListSpecializationId === allFilterValue
              ) {
                setTrainingPromptListSportId(allFilterValue);
                setTrainingPromptListSpecializationId(allFilterValue);
              } else {
                setTrainingPromptListSportId(null);
                setTrainingPromptListSpecializationId(null);
              }
              setTrainingEditorSource("active");
              setTrainingDraftId(null);
              setMessage(null);
            },
          }
        : promptListMode === "sport-area" && sportAreaPromptListAreaId
          ? {
              onClick: () => {
                if (
                  sportAreaPromptListSportId === allFilterValue &&
                  sportAreaPromptListSpecializationId === allFilterValue
                ) {
                  setSportAreaPromptListAreaId(null);
                } else if (
                  sportAreaPromptListSportId &&
                  sportAreaPromptListSportId !== allFilterValue &&
                  sportAreaPromptListSpecializationId &&
                  sportAreaPromptListSpecializationId !== allFilterValue
                ) {
                  setSportAreaPromptListSpecializationId(allFilterValue);
                } else if (
                  sportAreaPromptListSportId &&
                  sportAreaPromptListSportId !== allFilterValue &&
                  sportAreaPromptListSpecializationId === allFilterValue
                ) {
                  setSportAreaPromptListSportId(allFilterValue);
                  setSportAreaPromptListSpecializationId(allFilterValue);
                } else if (sportAreaPromptListSpecializationId) {
                  setSportAreaPromptListSportId(null);
                  setSportAreaPromptListSpecializationId(null);
                } else {
                  setSportAreaPromptListAreaId(null);
                }
                setSportAreaEditorSource("active");
                setSportAreaDraftId(null);
                setMessage(null);
              },
            }
          : promptListMode
            ? {
                onClick: () => {
                  setPromptListMode(null);
                  setSportAreaPromptListAreaId(null);
                  setSportAreaPromptListSportId(null);
                  setSportAreaPromptListSpecializationId(null);
                  setAreaConfigPromptListAreaId(null);
                  setAreaConfigPromptListSportId(null);
                  setAreaConfigPromptListSpecializationId(null);
                  setTrainingPromptListSportId(null);
                  setTrainingPromptListSpecializationId(null);
                  setMessage(null);
                },
              }
            : undefined;
  const currentHeaderOverview = getPromptOverview(mode);
  const promptListHeaderOverview = promptListMode
    ? getPromptOverview(promptListMode)
    : null;
  const pageHeader = editorOpen
    ? {
        eyebrow: "DETTAGLIO PROMPT",
        title: currentHeaderOverview.title,
        description: editorDescription,
      }
    : promptListHeaderOverview
      ? {
          eyebrow: "LISTA PROMPT",
          title:
            promptListMode === "sport-area" && sportAreaPromptListAreaId
              ? `Prompt ${areaDisplayName(
                  areas.find((area) => area.id === sportAreaPromptListAreaId)
                    ?.name,
                )}`
              : promptListMode === "area-config" && areaConfigPromptListAreaId
                ? `Prompt ${areaDisplayName(
                    areas.find((area) => area.id === areaConfigPromptListAreaId)
                      ?.name,
                  )}`
                : promptListMode === "training" &&
                    trainingPromptListSpecializationId
                  ? `Prompt ${
                      sports
                        .find((sport) => sport.id === trainingPromptListSportId)
                        ?.specializations.find(
                          (specialization) =>
                            specialization.id ===
                            trainingPromptListSpecializationId,
                        )?.label ?? "allenamento"
                    }`
                  : promptListHeaderOverview.title,
          description:
            promptListMode === "goal"
              ? "Lista dei prompt creati. Aprine uno per vedere dettagli, modifiche e attivazione."
              : promptListMode === "sport-area" && !sportAreaPromptListAreaId
                ? "Seleziona un'area della performance per vedere i prompt disponibili."
                : promptListMode === "sport-area"
                  ? "Prompt disponibili per l'area selezionata. Aprine uno per dettagli, modifica e attivazione."
                  : promptListMode === "area-config" &&
                      !areaConfigPromptListAreaId
                    ? "Seleziona un'area della performance per vedere le configurazioni disponibili."
                    : promptListMode === "area-config"
                      ? "Prompt disponibili per l'area selezionata. Aprine uno per dettagli, modifica e attivazione."
                      : promptListMode === "training" &&
                          !trainingPromptListSpecializationId
                        ? "Seleziona sport e specializzazione per vedere i prompt disponibili."
                        : promptListMode === "training"
                          ? "Prompt disponibili per il contesto selezionato. Aprine uno per dettagli, modifica e attivazione."
                          : "Prompt configurato per il contesto selezionato. Aprilo per vedere i dettagli completi.",
        }
      : {
          eyebrow: "GESTIONE PROMPT",
          title: "Prompt",
          description: "Scegli prompt, contesto, modifica e salva la bozza.",
        };
  return {
    promptBackAction,
    currentHeaderOverview,
    promptListHeaderOverview,
    pageHeader,
  };
}
