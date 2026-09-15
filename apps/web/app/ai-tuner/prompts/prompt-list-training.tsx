"use client";

import { EmptyState } from "@/app/components/product-shell";
import {
  readStoredTrainingDrafts,
  trainingDraftsKey,
} from "./prompt-draft-storage";
import { formatDate } from "./prompt-management-model";
import { allFilterValue } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderTrainingPrompts(model: PromptManagementModel) {
  const {
    trainingPromptListSportId,
    setTrainingPromptListSportId,
    trainingPromptListSpecializationId,
    setTrainingPromptListSpecializationId,
    setTrainingEditorSource,
    setTrainingDraftId,
    selectedSportId,
    setSelectedSportId,
    selectedSpecializationId,
    setSelectedSpecializationId,
    sports,
    getFilteredSportContexts,
    openPromptDetail,
    createNewDraft,
  } = model;

  const selectedListSport =
    trainingPromptListSportId && trainingPromptListSportId !== allFilterValue
      ? (sports.find((sport) => sport.id === trainingPromptListSportId) ?? null)
      : null;
  const selectedListSpecialization =
    selectedListSport &&
    trainingPromptListSpecializationId &&
    trainingPromptListSpecializationId !== allFilterValue
      ? (selectedListSport.specializations.find(
          (specialization) =>
            specialization.id === trainingPromptListSpecializationId,
        ) ?? null)
      : null;

  if (!selectedListSport || !selectedListSpecialization) {
    const menuSportId =
      trainingPromptListSportId ?? selectedSportId ?? allFilterValue;
    const menuSpecializationId =
      trainingPromptListSpecializationId ??
      selectedSpecializationId ??
      allFilterValue;
    const menuSport =
      menuSportId !== allFilterValue
        ? (sports.find((sport) => sport.id === menuSportId) ?? null)
        : null;
    const menuSpecializations = menuSport
      ? menuSport.specializations.map((specialization) => ({
          sport: menuSport,
          specialization,
        }))
      : sports.flatMap((sport) =>
          sport.specializations.map((specialization) => ({
            sport,
            specialization,
          })),
        );
    const menuContexts = getFilteredSportContexts(
      menuSportId,
      menuSpecializationId,
    );
    const showTrainingSportGroups =
      menuSportId === allFilterValue && menuSpecializationId === allFilterValue;

    return (
      <section className="pf-stack">
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header pf-prompt-current-header">
            <div>
              <h2>Contesti allenamento</h2>
              <p className="pf-muted">
                Scegli sport e specializzazione per vedere i prompt di
                allenamento disponibili.
              </p>
            </div>
          </div>

          {sports.length === 0 ? (
            <EmptyState
              title="Nessun contesto disponibile"
              description="Configura prima almeno uno sport e una specializzazione."
            />
          ) : (
            <div className="pf-stack">
              <div className="pf-two-col">
                <label className="pf-field">
                  Sport
                  <select
                    className="pf-select"
                    value={menuSportId}
                    onChange={(event) => {
                      const nextSportId = event.target.value;
                      setTrainingPromptListSportId(nextSportId);
                      setTrainingPromptListSpecializationId(
                        nextSportId === allFilterValue
                          ? allFilterValue
                          : menuSpecializationId,
                      );
                    }}
                  >
                    <option value={allFilterValue}>Tutti</option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  Specializzazione
                  <select
                    className="pf-select"
                    value={menuSpecializationId}
                    onChange={(event) =>
                      setTrainingPromptListSpecializationId(event.target.value)
                    }
                    disabled={menuSpecializations.length === 0}
                  >
                    <option value={allFilterValue}>Tutti</option>
                    {menuSpecializations.map(({ sport, specialization }) => (
                      <option
                        key={`${sport.id}:${specialization.id}`}
                        value={specialization.id}
                      >
                        {menuSport
                          ? specialization.label
                          : `${specialization.label} - ${sport.label}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {showTrainingSportGroups ? (
                <div className="pf-grid pf-created-prompts-grid">
                  {sports.map((sport) => {
                    const promptCount = sport.specializations.reduce(
                      (total, specialization) => {
                        const draftsCount = readStoredTrainingDrafts(
                          trainingDraftsKey(
                            sport.id ?? "",
                            specialization.id ?? "",
                          ),
                        ).length;
                        return (
                          total +
                          (specialization.trainingPrompt ? 1 : 0) +
                          draftsCount
                        );
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
                          setTrainingPromptListSportId(sport.id ?? null);
                          setTrainingPromptListSpecializationId(allFilterValue);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setTrainingPromptListSportId(sport.id ?? null);
                            setTrainingPromptListSpecializationId(
                              allFilterValue,
                            );
                          }
                        }}
                      >
                        <div className="pf-prompt-card-title">
                          <h3>{sport.label}</h3>
                        </div>
                        <p>
                          Apri per vedere i prompt divisi per specializzazione.
                        </p>
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
              ) : menuContexts.length > 0 ? (
                <div className="pf-grid pf-created-prompts-grid">
                  {menuContexts.map(({ sport, specialization }) => {
                    const menuDraftsCount = readStoredTrainingDrafts(
                      trainingDraftsKey(
                        sport.id ?? "",
                        specialization.id ?? "",
                      ),
                    ).length;
                    return (
                      <article
                        key={`${sport.id}:${specialization.id}`}
                        className="pf-card pf-created-prompt-card"
                      >
                        <div className="pf-prompt-card-title">
                          <h3>{specialization.label}</h3>
                        </div>
                        <p>{sport.label}</p>
                        <div className="pf-created-prompt-footer">
                          <div className="pf-prompt-overview-meta">
                            <span>
                              Prompt attivo
                              <strong>
                                {specialization.trainingPrompt
                                  ? "Presente"
                                  : "Da creare"}
                              </strong>
                            </span>
                            <span>
                              Stato
                              <strong>
                                {specialization.trainingPromptActive
                                  ? "Attivo"
                                  : "Non attivo"}
                              </strong>
                            </span>
                            <span>
                              Bozze
                              <strong>{menuDraftsCount}</strong>
                            </span>
                          </div>
                          <div className="pf-created-prompt-actions">
                            <button
                              type="button"
                              className="pf-button"
                              onClick={() => {
                                setSelectedSportId(sport.id ?? "");
                                setSelectedSpecializationId(
                                  specialization.id ?? "",
                                );
                                setTrainingPromptListSportId(sport.id ?? null);
                                setTrainingPromptListSpecializationId(
                                  specialization.id ?? null,
                                );
                                setTrainingEditorSource("active");
                                setTrainingDraftId(null);
                              }}
                            >
                              Apri prompt
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Nessuna specializzazione"
                  description="Seleziona uno sport con almeno una specializzazione."
                />
              )}
            </div>
          )}
        </section>
      </section>
    );
  }

  const trainingDrafts =
    selectedListSport.id && selectedListSpecialization.id
      ? readStoredTrainingDrafts(
          trainingDraftsKey(
            selectedListSport.id,
            selectedListSpecialization.id,
          ),
        )
      : [];

  return (
    <section className="pf-stack">
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Prompt {selectedListSpecialization.label}</h2>
            <p className="pf-muted">
              Prompt disponibili per questo contesto di allenamento. Quello
              marcato in uso e attivo per gli utenti.
            </p>
          </div>
          <div className="pf-actions pf-prompt-current-actions">
            <button
              className="pf-button"
              type="button"
              onClick={() => {
                setSelectedSportId(selectedListSport.id ?? "");
                setSelectedSpecializationId(
                  selectedListSpecialization.id ?? "",
                );
                createNewDraft();
              }}
            >
              Crea nuova bozza
            </button>
          </div>
        </div>

        <div className="pf-grid pf-created-prompts-grid">
          {selectedListSpecialization.trainingPrompt && (
            <article
              className="pf-card pf-created-prompt-card in-use"
              role="button"
              tabIndex={0}
              onClick={() => {
                openPromptDetail(undefined, {
                  sportId: selectedListSport.id ?? "",
                  specializationId: selectedListSpecialization.id ?? "",
                  trainingSource: "active",
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPromptDetail(undefined, {
                    sportId: selectedListSport.id ?? "",
                    specializationId: selectedListSpecialization.id ?? "",
                    trainingSource: "active",
                  });
                }
              }}
            >
              <span className="pf-created-prompt-badge">In uso</span>
              <div className="pf-prompt-card-title">
                <h3>Prompt attivo</h3>
              </div>
              <p>
                Prompt attivo per trasformare obiettivo e dati atleta in
                allenamento specifico.
              </p>
              <div className="pf-created-prompt-footer">
                <div className="pf-prompt-overview-meta">
                  <span>
                    Versione
                    <strong>
                      {selectedListSpecialization.trainingPromptVersion
                        ? `v${selectedListSpecialization.trainingPromptVersion}`
                        : "-"}
                    </strong>
                  </span>
                  <span>
                    Ultima modifica
                    <strong>
                      {formatDate(selectedListSpecialization.updatedAt)}
                    </strong>
                  </span>
                  <span>
                    Stato
                    <strong>In uso</strong>
                  </span>
                </div>
              </div>
            </article>
          )}

          {trainingDrafts.map((draft) => (
            <article
              key={draft.id}
              className="pf-card pf-created-prompt-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                openPromptDetail(undefined, {
                  sportId: selectedListSport.id ?? "",
                  specializationId: selectedListSpecialization.id ?? "",
                  trainingSource: "draft",
                  trainingDraftId: draft.id,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPromptDetail(undefined, {
                    sportId: selectedListSport.id ?? "",
                    specializationId: selectedListSpecialization.id ?? "",
                    trainingSource: "draft",
                    trainingDraftId: draft.id,
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
                {selectedListSpecialization.label} / {selectedListSport.label}
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

          {!selectedListSpecialization.trainingPrompt &&
            trainingDrafts.length === 0 && (
              <EmptyState
                title="Nessun prompt per questo contesto"
                description="Crea una nuova bozza per iniziare."
              />
            )}
        </div>
      </section>
    </section>
  );
}
