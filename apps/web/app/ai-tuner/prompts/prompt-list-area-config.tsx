"use client";

import { EmptyState } from "@/app/components/product-shell";
import {
  areaConfigDraftsKey,
  readStoredAreaConfigDrafts,
} from "./prompt-draft-storage";
import { formatDate } from "./prompt-management-model";
import { renderSportContextPicker } from "./prompt-management-sport-context-picker";
import { renderSportFilterControls } from "./prompt-management-sport-filter-controls";
import { allFilterValue, areaDisplayName } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderAreaConfigPrompts(model: PromptManagementModel) {
  const {
    areaConfigPromptListAreaId,
    setAreaConfigPromptListAreaId,
    areaConfigPromptListSportId,
    setAreaConfigPromptListSportId,
    areaConfigPromptListSpecializationId,
    setAreaConfigPromptListSpecializationId,
    setAreaConfigEditorSource,
    setAreaConfigDraftId,
    setSelectedSportId,
    setSelectedSpecializationId,
    setSelectedAreaId,
    areas,
    sports,
    areaConfigs,
    getFilteredSportContexts,
    openPromptDetail,
    createNewDraft,
  } = model;

  const selectedListArea =
    areas.find((area) => area.id === areaConfigPromptListAreaId) ?? null;

  if (!selectedListArea) {
    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>Aree della performance</h2>
              <p className="pf-muted">
                Scegli un'area per vedere le configurazioni di proposta
                disponibili e quella attualmente in uso.
              </p>
            </div>
          </div>

          <div className="pf-grid pf-created-prompts-grid pf-created-prompts-list">
            {areas.map((area) => {
              const config = areaConfigs.find(
                (item) => item.areaId === area.id,
              );
              const draftsCount = readStoredAreaConfigDrafts(
                areaConfigDraftsKey(area.id),
              ).length;
              return (
                <article
                  key={area.id}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedAreaId(area.id);
                    setAreaConfigPromptListAreaId(area.id);
                    setAreaConfigPromptListSportId(allFilterValue);
                    setAreaConfigPromptListSpecializationId(allFilterValue);
                    setAreaConfigEditorSource("active");
                    setAreaConfigDraftId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAreaId(area.id);
                      setAreaConfigPromptListAreaId(area.id);
                      setAreaConfigPromptListSportId(allFilterValue);
                      setAreaConfigPromptListSpecializationId(allFilterValue);
                      setAreaConfigEditorSource("active");
                      setAreaConfigDraftId(null);
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>{areaDisplayName(area.name)}</h3>
                  </div>
                  <p>
                    Configurazione usata per generare proposta operativa e
                    questionario di monitoraggio dell'area.
                  </p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Prompt attivo
                        <strong>{config ? "Presente" : "Da creare"}</strong>
                      </span>
                      <span>
                        Versione
                        <strong>{config ? "v1" : "-"}</strong>
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

  if (!areaConfigPromptListSportId || !areaConfigPromptListSpecializationId) {
    return renderSportContextPicker(model, {
      title: `Sport per ${areaDisplayName(selectedListArea.name)}`,
      description:
        "Scegli sport e specializzazione di riferimento prima di aprire i prompt di proposta per questa area.",
      selectedSportId: areaConfigPromptListSportId,
      selectedSpecializationId: areaConfigPromptListSpecializationId,
      onSportChange: (sportId, specializationId) => {
        setAreaConfigPromptListSportId(sportId || null);
        setAreaConfigPromptListSpecializationId(specializationId || null);
      },
      onOpen: (sportId, specializationId) => {
        if (sportId !== allFilterValue && specializationId !== allFilterValue) {
          setSelectedSportId(sportId);
          setSelectedSpecializationId(specializationId);
        }
        setAreaConfigPromptListSportId(sportId);
        setAreaConfigPromptListSpecializationId(specializationId);
        setAreaConfigEditorSource("active");
        setAreaConfigDraftId(null);
      },
    });
  }

  const selectedContexts = getFilteredSportContexts(
    areaConfigPromptListSportId,
    areaConfigPromptListSpecializationId,
  );
  const showAreaConfigSportGroups =
    areaConfigPromptListSportId === allFilterValue &&
    areaConfigPromptListSpecializationId === allFilterValue;
  const showAreaConfigSpecializationGroups =
    !!areaConfigPromptListSportId &&
    areaConfigPromptListSportId !== allFilterValue &&
    areaConfigPromptListSpecializationId === allFilterValue;
  const canCreateAreaConfigDraft =
    selectedContexts.length === 1 &&
    areaConfigPromptListSportId !== allFilterValue &&
    areaConfigPromptListSpecializationId !== allFilterValue;
  const activeConfig = areaConfigs.find(
    (item) => item.areaId === selectedListArea.id,
  );
  const areaConfigDraftEntries = selectedContexts.flatMap(
    ({ sport, specialization }) =>
      readStoredAreaConfigDrafts(
        areaConfigDraftsKey(selectedListArea.id, sport.id, specialization.id),
      ).map((draft) => ({
        sport,
        specialization,
        draft,
      })),
  );

  if (showAreaConfigSportGroups) {
    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>Prompt {areaDisplayName(selectedListArea.name)}</h2>
              <p className="pf-muted">
                Scegli uno sport per vedere le zone disponibili per questa area.
              </p>
            </div>
          </div>

          {renderSportFilterControls(model, {
            selectedSportId: areaConfigPromptListSportId,
            selectedSpecializationId: areaConfigPromptListSpecializationId,
            onSportChange: (sportId, specializationId) => {
              setAreaConfigPromptListSportId(sportId);
              setAreaConfigPromptListSpecializationId(specializationId);
            },
          })}

          <div className="pf-grid pf-created-prompts-grid">
            {sports.map((sport) => {
              const draftsCount = sport.specializations.reduce(
                (total, specialization) =>
                  total +
                  readStoredAreaConfigDrafts(
                    areaConfigDraftsKey(
                      selectedListArea.id,
                      sport.id,
                      specialization.id,
                    ),
                  ).length,
                0,
              );

              return (
                <article
                  key={sport.id}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setAreaConfigPromptListSportId(sport.id ?? null);
                    setAreaConfigPromptListSpecializationId(allFilterValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setAreaConfigPromptListSportId(sport.id ?? null);
                      setAreaConfigPromptListSpecializationId(allFilterValue);
                    }
                  }}
                >
                  <div className="pf-prompt-card-title">
                    <h3>{sport.label}</h3>
                  </div>
                  <p>Apri per vedere le zone di questo sport.</p>
                  <div className="pf-created-prompt-footer">
                    <div className="pf-prompt-overview-meta">
                      <span>
                        Specializzazioni
                        <strong>{sport.specializations.length}</strong>
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

  if (showAreaConfigSpecializationGroups) {
    const sportGroup =
      sports.find((sport) => sport.id === areaConfigPromptListSportId) ?? null;

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>{sportGroup?.label ?? "Sport"}</h2>
              <p className="pf-muted">
                Scegli una zona per vedere i prompt di proposta relativi a{" "}
                {areaDisplayName(selectedListArea.name)}.
              </p>
            </div>
          </div>

          {renderSportFilterControls(model, {
            selectedSportId: areaConfigPromptListSportId,
            selectedSpecializationId: areaConfigPromptListSpecializationId,
            onSportChange: (sportId, specializationId) => {
              setAreaConfigPromptListSportId(sportId);
              setAreaConfigPromptListSpecializationId(specializationId);
            },
          })}

          <div className="pf-grid pf-created-prompts-grid">
            {selectedContexts.map(({ sport, specialization }) => {
              const draftsCount = readStoredAreaConfigDrafts(
                areaConfigDraftsKey(
                  selectedListArea.id,
                  sport.id,
                  specialization.id,
                ),
              ).length;
              const promptCount = (activeConfig ? 1 : 0) + draftsCount;

              return (
                <article
                  key={`${sport.id}:${specialization.id}`}
                  className="pf-card pf-created-prompt-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setAreaConfigPromptListSpecializationId(
                      specialization.id ?? null,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setAreaConfigPromptListSpecializationId(
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
                        <strong>{activeConfig ? "In uso" : "Da creare"}</strong>
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
              Configurazioni disponibili per questa area. Quella marcata in uso
              genera le proposte per gli utenti.
            </p>
          </div>
          {canCreateAreaConfigDraft && (
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
          selectedSportId: areaConfigPromptListSportId,
          selectedSpecializationId: areaConfigPromptListSpecializationId,
          onSportChange: (sportId, specializationId) => {
            setAreaConfigPromptListSportId(sportId);
            setAreaConfigPromptListSpecializationId(specializationId);
          },
        })}

        <div className="pf-grid pf-created-prompts-grid">
          {activeConfig &&
            selectedContexts.map(({ sport, specialization }) => (
              <article
                key={`active:${sport.id}:${specialization.id}`}
                className="pf-card pf-created-prompt-card in-use"
                role="button"
                tabIndex={0}
                onClick={() => {
                  openPromptDetail(undefined, {
                    areaId: selectedListArea.id,
                    sportId: sport.id ?? "",
                    specializationId: specialization.id ?? "",
                    areaConfigSource: "active",
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPromptDetail(undefined, {
                      areaId: selectedListArea.id,
                      sportId: sport.id ?? "",
                      specializationId: specialization.id ?? "",
                      areaConfigSource: "active",
                    });
                  }
                }}
              >
                <span className="pf-created-prompt-badge">In uso</span>
                <div className="pf-prompt-card-title">
                  <h3>{specialization.label}</h3>
                </div>
                <p>{sport.label}</p>
                <div className="pf-created-prompt-footer">
                  <div className="pf-prompt-overview-meta">
                    <span>
                      Versione
                      <strong>v1</strong>
                    </span>
                    <span>
                      Ultima modifica
                      <strong>{formatDate(activeConfig.updatedAt)}</strong>
                    </span>
                    <span>
                      Stato
                      <strong>In uso</strong>
                    </span>
                  </div>
                </div>
              </article>
            ))}

          {areaConfigDraftEntries.map(({ sport, specialization, draft }) => (
            <article
              key={`${sport.id}:${specialization.id}:${draft.id}`}
              className="pf-card pf-created-prompt-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                openPromptDetail(undefined, {
                  areaId: selectedListArea.id,
                  sportId: sport.id ?? "",
                  specializationId: specialization.id ?? "",
                  areaConfigSource: "draft",
                  areaConfigDraftId: draft.id,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPromptDetail(undefined, {
                    areaId: selectedListArea.id,
                    sportId: sport.id ?? "",
                    specializationId: specialization.id ?? "",
                    areaConfigSource: "draft",
                    areaConfigDraftId: draft.id,
                  });
                }
              }}
            >
              <div className="pf-prompt-card-title">
                <h3>
                  {draft.name.startsWith("Precedente")
                    ? "Bozza precedente"
                    : draft.name}
                </h3>
              </div>
              <p>
                {specialization.label} / {sport.label}
              </p>
              <div className="pf-created-prompt-footer">
                <div className="pf-prompt-overview-meta">
                  <span>
                    Versione
                    <strong>Bozza</strong>
                  </span>
                  <span>
                    Ultima modifica
                    <strong>{formatDate(draft.updatedAt)}</strong>
                  </span>
                  <span>
                    Stato
                    <strong>Non attivo</strong>
                  </span>
                </div>
              </div>
            </article>
          ))}

          {!activeConfig && areaConfigDraftEntries.length === 0 && (
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
