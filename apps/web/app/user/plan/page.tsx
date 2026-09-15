"use client";

import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { useUserPlan } from "./use-user-plan";
import { cleanStato, formatDate } from "./user-plan-model";

export default function UserPianoPage() {
  const model = useUserPlan();
  const {
    setPiano,
    training,
    trainingHistory,
    message,
    setMessage,
    trainingMessage,
    loading,
    setLoading,
    trainingLoading,
    authHint,
    setAuthHint,
    notesById,
    setNotesById,
    ratingById,
    setRatingById,
    areas,
    areaId,
    setAreaId,
    plansByArea,
    planRequestIdRef,
    activeAreaItems,
    trainingItems,
    completedTrainingItems,
    totalOpenActivities,
    loadPiano,
    loadAll,
    completePlanItem,
    completeTrainingItem,
  } = model;
  return (
    <ProductShell
      eyebrow="Ambiente atleta"
      title="Attivita"
      description="Percorso sportivo e lavori per area sono nello stesso spazio, ma restano distinti per obiettivo e responsabilita."
      actions={
        <button
          className="pf-button-secondary"
          type="button"
          onClick={() => loadAll()}
        >
          Aggiorna
        </button>
      }
      stats={[
        {
          label: "Attivita aperte",
          value: loading || trainingLoading ? "..." : totalOpenActivities,
          tone: "accent",
        },
        {
          label: "Percorso sportivo",
          value: training ? cleanStato(training.status) : "-",
          tone: training ? "success" : "neutral",
        },
        {
          label: "Lavori area",
          value: loading ? "..." : activeAreaItems.length,
          tone: "warning",
        },
      ]}
    >
      <section className="pf-panel pf-focus-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Percorso sportivo</h2>
            <p className="pf-muted">
              Lavoro complessivo generato per sport e specializzazione.
            </p>
          </div>
          {training && (
            <StatusBadge tone="success">
              {cleanStato(training.status)}
            </StatusBadge>
          )}
        </div>

        {trainingMessage && <div className="pf-alert">{trainingMessage}</div>}

        {!trainingLoading && !training && (
          <EmptyState
            title="Nessun percorso sportivo"
            description="Quando viene pubblicato, lo vedrai qui separato dai lavori per area."
          />
        )}

        {training && (
          <div className="pf-stack">
            <div>
              <p className="pf-muted">
                Generato il {formatDate(training.createdAt)}
                {training.specialization
                  ? ` - ${training.specialization.sport.label} / ${training.specialization.label}`
                  : ""}
              </p>
              <p>{training.summaryText}</p>
            </div>

            {trainingItems.map((item, index) => {
              const itemId =
                "id" in item && typeof item.id === "string" ? item.id : null;
              const itemStatus =
                "status" in item && typeof item.status === "string"
                  ? item.status
                  : "";
              const actionable = Boolean(itemId) && itemStatus === "ACTIVE";
              const completed = itemStatus === "COMPLETED";
              const completedAt =
                "completedAt" in item &&
                (typeof item.completedAt === "string" ||
                  item.completedAt === null)
                  ? item.completedAt
                  : null;
              const completionRating =
                "completionRating" in item &&
                typeof item.completionRating === "number"
                  ? item.completionRating
                  : null;

              return (
                <article
                  key={`${item.title ?? "item"}:${index}`}
                  className="pf-card pf-active-plan-card"
                >
                  <div className="pf-card-top pf-active-plan-header">
                    <div>
                      <p className="pf-eyebrow">
                        {"type" in item ? item.type : "Percorso sportivo"}
                      </p>
                      <h3>{item.title ?? `Blocco ${index + 1}`}</h3>
                    </div>
                    {itemStatus && (
                      <StatusBadge tone={completed ? "success" : "accent"}>
                        {cleanStato(itemStatus)}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="pf-active-plan-body">{item.body}</p>
                  {completed && (
                    <p className="pf-muted">
                      Completato {formatDate(completedAt)}
                      {completionRating ? ` - voto ${completionRating}/10` : ""}
                    </p>
                  )}
                  {actionable && itemId && (
                    <>
                      <div className="pf-grid pf-active-plan-form">
                        <label className="pf-field">
                          Note di completamento
                          <textarea
                            className="pf-textarea"
                            rows={3}
                            value={notesById[itemId] ?? ""}
                            onChange={(event) =>
                              setNotesById((prev) => ({
                                ...prev,
                                [itemId]: event.target.value,
                              }))
                            }
                            placeholder="Cosa hai completato?"
                          />
                        </label>
                        <label className="pf-field">
                          Voto
                          <input
                            className="pf-input"
                            type="number"
                            min={1}
                            max={10}
                            value={ratingById[itemId] ?? ""}
                            onChange={(event) =>
                              setRatingById((prev) => ({
                                ...prev,
                                [itemId]: event.target.value,
                              }))
                            }
                            placeholder="1-10"
                          />
                        </label>
                      </div>
                      <div className="pf-active-plan-actions">
                        <button
                          className="pf-button"
                          type="button"
                          onClick={() => completeTrainingItem(itemId)}
                        >
                          Segna come completato
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}

            <div className="pf-metric-row">
              <span>Completati</span>
              <strong>{completedTrainingItems.length}</strong>
            </div>
            <div className="pf-metric-row">
              <span>Storico percorso</span>
              <strong>{trainingHistory.length}</strong>
            </div>
          </div>
        )}
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Lavori per area</h2>
            <p className="pf-muted">
              Attivita operative collegate alle aree performance.
            </p>
          </div>
        </div>
        <div className="pf-area-grid">
          {areas.map((area) => {
            const areaPiano = plansByArea[area.id];
            const active =
              areaPiano?.items.filter((item) => item.status === "ACTIVE")
                .length ?? 0;
            const completed =
              areaPiano?.items.filter((item) => item.status === "COMPLETED")
                .length ?? 0;
            const selected = area.id === areaId;
            return (
              <button
                key={area.id}
                className={`pf-area-card ${selected ? "selected" : ""} ${active ? "attention" : ""}`}
                type="button"
                onClick={() => {
                  planRequestIdRef.current += 1;
                  setAreaId(area.id);
                  setPiano(areaPiano ?? null);
                  setAuthHint(null);
                  setMessage(null);
                  setNotesById({});
                  setRatingById({});
                  setLoading(false);
                }}
              >
                <span>
                  <strong>{area.name}</strong>
                  <small>
                    {active
                      ? `${active} ${active === 1 ? "lavoro" : "lavori"} da fare`
                      : completed
                        ? `${completed} completati`
                        : "Da assegnare"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Lavori aperti</h2>
            <p className="pf-muted">
              Completa le attivita solo quando sono state davvero eseguite.
            </p>
          </div>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadPiano()}
          >
            Aggiorna lavori
          </button>
        </div>

        {authHint && <div className="pf-alert warning">{authHint}</div>}
        {message && <div className="pf-alert">{message}</div>}

        <div className="pf-stack">
          {activeAreaItems.map((item) => (
            <article key={item.id} className="pf-card pf-active-plan-card">
              <div className="pf-card-top pf-active-plan-header">
                <div>
                  <p className="pf-active-plan-area">
                    {item.area?.name ?? "Area"}
                  </p>
                  <h3>{item.title}</h3>
                </div>
                <StatusBadge tone="accent">
                  {cleanStato(item.status)}
                </StatusBadge>
              </div>
              <p className="pf-active-plan-body">{item.body}</p>
              <div className="pf-grid pf-active-plan-form">
                <label className="pf-field">
                  Note di completamento
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={notesById[item.id] ?? ""}
                    onChange={(event) =>
                      setNotesById((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Cosa hai completato?"
                  />
                </label>
                <label className="pf-field">
                  Voto
                  <input
                    className="pf-input"
                    type="number"
                    min={1}
                    max={10}
                    value={ratingById[item.id] ?? ""}
                    onChange={(event) =>
                      setRatingById((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="1-10"
                  />
                </label>
              </div>
              <div className="pf-active-plan-actions">
                <button
                  className="pf-button"
                  type="button"
                  onClick={() => completePlanItem(item.id)}
                >
                  Segna come completata
                </button>
              </div>
            </article>
          ))}

          {!loading && activeAreaItems.length === 0 && (
            <p className="pf-plain-empty">
              {areaId ? "Nessun lavoro da fare." : "Seleziona un'area."}
            </p>
          )}
        </div>
      </section>
    </ProductShell>
  );
}
