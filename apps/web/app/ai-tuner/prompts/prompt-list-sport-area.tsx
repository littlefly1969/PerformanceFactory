"use client";

import { EmptyState } from "@/app/components/product-shell";
import { formatDate } from "./prompt-management-model";
import { renderSportContextPicker } from "./prompt-management-sport-context-picker";
import { renderSportFilterControls } from "./prompt-management-sport-filter-controls";
import { allFilterValue, areaDisplayName } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderSportAreaPrompts(model: PromptManagementModel) {
  const {
    sportAreaPromptListAreaId,
    setSportAreaPromptListAreaId,
    sportAreaPromptListSportId,
    setSportAreaPromptListSportId,
    sportAreaPromptListSpecializationId,
    setSportAreaPromptListSpecializationId,
    setSportAreaEditorSource,
    setSportAreaDraftId,
    setSelectedSportId,
    setSelectedSpecializationId,
    setSelectedAreaId,
    areas,
    sports,
    selectedSport,
    selectedSpecialization,
    getFilteredSportContexts,
    sportAreaDraftsFor,
    openPromptDetail,
    createNewDraft,
  } = model;

  const selectedListArea =
    areas.find((area) => area.id === sportAreaPromptListAreaId) ?? null;

  if (!selectedListArea) {
    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>Aree della performance</h2>
              <p className="pf-muted">
                Scegli un'area per vedere i prompt disponibili e quale e
                attualmente in uso.
              </p>
            </div>
          </div>

          <div className="pf-grid pf-created-prompts-grid pf-created-prompts-list">
            {areas.map((area) => {
              const prompt = selectedSpecialization?.prompts.find(
                (item) => item.areaId === area.id,
              );
              const draftsCount = sportAreaDraftsFor(
                selectedSport,
                selectedSpecialization,
                area,
                prompt,
              ).length;
              return (
                <article
                  key={area.id}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedAreaId(area.id);
                    setSportAreaPromptListAreaId(area.id);
                    setSportAreaPromptListSportId(allFilterValue);
                    setSportAreaPromptListSpecializationId(allFilterValue);
                    setSportAreaEditorSource("active");
                    setSportAreaDraftId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAreaId(area.id);
                      setSportAreaPromptListAreaId(area.id);
                      setSportAreaPromptListSportId(allFilterValue);
                      setSportAreaPromptListSpecializationId(allFilterValue);
                      setSportAreaEditorSource("active");
                      setSportAreaDraftId(null);
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>{areaDisplayName(area.name)}</h3>
                  </div>
                  <p>
                    Area della performance configurata per lo sport e la
                    specializzazione selezionati.
                  </p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Prompt attivo
                        <strong>{prompt ? "Presente" : "Da creare"}</strong>
                      </span>
                      <span>
                        Stato area
                        <strong>
                          {(prompt?.isEnabledDriver ?? true)
                            ? "Attiva"
                            : "Disattiva"}
                        </strong>
                      </span>
                      <span>
                        Bozze
                        <strong>{draftsCount}</strong>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    );
  }

  if (!sportAreaPromptListSportId || !sportAreaPromptListSpecializationId) {
    return renderSportContextPicker(model, {
      title: `Sport per ${areaDisplayName(selectedListArea.name)}`,
      description:
        "Scegli sport e specializzazione di riferimento prima di aprire i prompt di questa area.",
      selectedSportId: sportAreaPromptListSportId,
      selectedSpecializationId: sportAreaPromptListSpecializationId,
      onSportChange: (sportId, specializationId) => {
        setSportAreaPromptListSportId(sportId || null);
        setSportAreaPromptListSpecializationId(specializationId || null);
      },
      onOpen: (sportId, specializationId) => {
        if (sportId !== allFilterValue && specializationId !== allFilterValue) {
          setSelectedSportId(sportId);
          setSelectedSpecializationId(specializationId);
        }
        setSportAreaPromptListSportId(sportId);
        setSportAreaPromptListSpecializationId(specializationId);
        setSportAreaEditorSource("active");
        setSportAreaDraftId(null);
      },
    });
  }

  const selectedContexts = getFilteredSportContexts(
    sportAreaPromptListSportId,
    sportAreaPromptListSpecializationId,
  );
  const showSportAreaSportGroups =
    sportAreaPromptListSportId === allFilterValue &&
    sportAreaPromptListSpecializationId === allFilterValue;
  const showSportAreaSpecializationGroups =
    !!sportAreaPromptListSportId &&
    sportAreaPromptListSportId !== allFilterValue &&
    sportAreaPromptListSpecializationId === allFilterValue;
  const canCreateSportAreaDraft =
    selectedContexts.length === 1 &&
    sportAreaPromptListSportId !== allFilterValue &&
    sportAreaPromptListSpecializationId !== allFilterValue;
  const sportAreaPromptEntries = selectedContexts.flatMap(
    ({ sport, specialization }) => {
      const activePrompt = specialization.prompts.find(
        (item) => item.areaId === selectedListArea.id,
      );
      return [
        ...(activePrompt
          ? [
              {
                kind: "active" as const,
                sport,
                specialization,
                prompt: activePrompt,
              },
            ]
          : []),
        ...sportAreaDraftsFor(
          sport,
          specialization,
          selectedListArea,
          activePrompt,
        ).map((draft) => ({
          kind: "draft" as const,
          sport,
          specialization,
          draft,
        })),
      ];
    },
  );

  if (showSportAreaSportGroups) {
    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
              <p className="pf-muted">
                Scegli uno sport per vedere le specializzazioni e i prompt
                disponibili per questa area.
              </p>
            </div>
          </div>

          {renderSportFilterControls(model, {
            selectedSportId: sportAreaPromptListSportId,
            selectedSpecializationId: sportAreaPromptListSpecializationId,
            onSportChange: (sportId, specializationId) => {
              setSportAreaPromptListSportId(sportId);
              setSportAreaPromptListSpecializationId(specializationId);
            },
          })}

          <div className="pf-grid pf-created-prompts-grid">
            {sports.map((sport) => {
              const promptCount = sport.specializations.reduce(
                (total, specialization) => {
                  const activePrompt = specialization.prompts.find(
                    (item) => item.areaId === selectedListArea.id,
                  );
                  const draftsCount = activePrompt
                    ? sportAreaDraftsFor(
                        sport,
                        specialization,
                        selectedListArea,
                        activePrompt,
                      ).length
                    : 0;
                  return total + (activePrompt ? 1 : 0) + draftsCount;
                },
                0,
              );

              return (
                <article
                  key={sport.id}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSportAreaPromptListSportId(sport.id ?? null);
                    setSportAreaPromptListSpecializationId(allFilterValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSportAreaPromptListSportId(sport.id ?? null);
                      setSportAreaPromptListSpecializationId(allFilterValue);
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>{sport.label}</h3>
                  </div>
                  <p>Apri per vedere i prompt divisi per specializzazione.</p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Specializzazioni
                        <strong>{sport.specializations.length}</strong>
                      </span>
                      <span>
                        Prompt
                        <strong>{promptCount}</strong>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    );
  }

  if (showSportAreaSpecializationGroups) {
    const sportGroup =
      sports.find((sport) => sport.id === sportAreaPromptListSportId) ?? null;

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>{sportGroup?.label ?? "Sport"}</h2>
              <p className="pf-muted">
                Scegli una specializzazione per vedere i prompt disponibili per{" "}
                {areaDisplayName(selectedListArea.name)}.
              </p>
            </div>
          </div>

          {renderSportFilterControls(model, {
            selectedSportId: sportAreaPromptListSportId,
            selectedSpecializationId: sportAreaPromptListSpecializationId,
            onSportChange: (sportId, specializationId) => {
              setSportAreaPromptListSportId(sportId);
              setSportAreaPromptListSpecializationId(specializationId);
            },
          })}

          <div className="pf-grid pf-created-prompts-grid">
            {selectedContexts.map(({ sport, specialization }) => {
              const activePrompt = specialization.prompts.find(
                (item) => item.areaId === selectedListArea.id,
              );
              const draftsCount = sportAreaDraftsFor(
                sport,
                specialization,
                selectedListArea,
                activePrompt,
              ).length;
              const promptCount = (activePrompt ? 1 : 0) + draftsCount;

              return (
                <article
                  key={`${sport.id}:${specialization.id}`}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSportAreaPromptListSpecializationId(
                      specialization.id ?? null,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSportAreaPromptListSpecializationId(
                        specialization.id ?? null,
                      );
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>{specialization.label}</h3>
                  </div>
                  <p>{sport.label}</p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Prompt
                        <strong>{promptCount}</strong>
                      </span>
                      <span>
                        Stato
                        <strong>{activePrompt ? "In uso" : "Da creare"}</strong>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="pf-stack">
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
            <p className="pf-muted">
              Prompt disponibili per questa area. Quello marcato in uso e quello
              attivo per gli utenti.
            </p>
          </div>
          {canCreateSportAreaDraft && (
            <div className="pf-actions pf-prompt-current-actions">
              <button
                className="pf-button"
                type="button"
                onClick={() => {
                  const context = selectedContexts[0];
                  setSelectedAreaId(selectedListArea.id);
                  setSelectedSportId(context.sport.id ?? "");
                  setSelectedSpecializationId(context.specialization.id ?? "");
                  createNewDraft();
                }}
              >
                Crea nuova bozza
              </button>
            </div>
          )}
        </div>

        {renderSportFilterControls(model, {
          selectedSportId: sportAreaPromptListSportId,
          selectedSpecializationId: sportAreaPromptListSpecializationId,
          onSportChange: (sportId, specializationId) => {
            setSportAreaPromptListSportId(sportId);
            setSportAreaPromptListSpecializationId(specializationId);
          },
        })}

        <div className="pf-grid pf-created-prompts-grid">
          {sportAreaPromptEntries.map((entry) => (
            <article
              key={
                entry.kind === "active"
                  ? `active:${entry.sport.id}:${entry.specialization.id}`
                  : `draft:${entry.sport.id}:${entry.specialization.id}:${entry.draft.id}`
              }
              className={`pf-card pf-created-prompt-card ${
                entry.kind === "active" ? "in-use" : ""
              }`}
              role="button"
              tabIndex={0}
              onClick={() => {
                openPromptDetail(undefined, {
                  areaId: selectedListArea.id,
                  sportId: entry.sport.id ?? "",
                  specializationId: entry.specialization.id ?? "",
                  sportAreaSource: entry.kind === "active" ? "active" : "draft",
                  sportAreaDraftId:
                    entry.kind === "draft" ? entry.draft.id : undefined,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPromptDetail(undefined, {
                    areaId: selectedListArea.id,
                    sportId: entry.sport.id ?? "",
                    specializationId: entry.specialization.id ?? "",
                    sportAreaSource:
                      entry.kind === "active" ? "active" : "draft",
                    sportAreaDraftId:
                      entry.kind === "draft" ? entry.draft.id : undefined,
                  });
                }
              }}
            >
              {entry.kind === "active" && (
                <span className="pf-created-prompt-badge">In uso</span>
              )}
              <div className="pf-prompt-card-title">
                <h3>
                  {entry.kind === "active"
                    ? entry.specialization.label
                    : entry.draft.name.startsWith("Precedente")
                      ? "Bozza precedente"
                      : entry.draft.name}
                </h3>
              </div>
              <p>
                {entry.kind === "active"
                  ? entry.sport.label
                  : `${entry.specialization.label} / ${entry.sport.label}`}
              </p>
              <div className="pf-created-prompt-footer">
                <div className="pf-prompt-overview-meta">
                  <span>
                    Versione
                    <strong>
                      {entry.kind === "active"
                        ? entry.prompt.version
                          ? `v${entry.prompt.version}`
                          : "-"
                        : "Bozza"}
                    </strong>
                  </span>
                  <span>
                    Ultima modifica
                    <strong>
                      {formatDate(
                        entry.kind === "active"
                          ? entry.prompt.updatedAt
                          : entry.draft.updatedAt,
                      )}
                    </strong>
                  </span>
                  <span>
                    Stato
                    <strong>
                      {entry.kind === "active" ? "In uso" : "Non attivo"}
                    </strong>
                  </span>
                </div>
              </div>
            </article>
          ))}

          {sportAreaPromptEntries.length === 0 && (
            <EmptyState
              title="Nessun prompt per questa area"
              description="Crea una nuova bozza per iniziare."
            />
          )}
        </div>
      </section>
    </section>
  );
}
