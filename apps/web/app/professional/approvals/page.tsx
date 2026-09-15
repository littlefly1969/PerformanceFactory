"use client";

import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import Link from "next/link";
import { formatDate } from "./professional-approvals-model";
import { useProfessionalApprovals } from "./use-professional-approvals";

export default function ProfessionalApprovazioniPage() {
  const model = useProfessionalApprovals();
  const {
    inbox,
    loading,
    message,
    authHint,
    rejectReasons,
    setRejectReasons,
    busyIds,
    groups,
    totalPending,
    loadInbox,
    approveQuestionSet,
    rejectQuestionSet,
    approvePlanItem,
    rejectPlanItem,
    approveTrainingQuestionSet,
    rejectTrainingQuestionSet,
    approveTrainingPlanItem,
    rejectTrainingPlanItem,
  } = model;
  return (
    <ProductShell
      eyebrow="Ambiente professionista"
      title="Revisione atleti"
      description="Rivedi in un unico punto ogni atleta con questionari e attivita pendenti, poi approva o rifiuta senza cercare in liste separate."
      actions={
        <div className="pf-header-actions">
          <Link className="pf-button-secondary" href="/professional">
            Riepilogo atleti
          </Link>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadInbox()}
          >
            Aggiorna
          </button>
        </div>
      }
      stats={[
        {
          label: "Atleti con lavoro",
          value: loading ? "..." : groups.length,
          tone: "accent",
        },
        {
          label: "Questionari",
          value: loading ? "..." : inbox.questionApprovals.length,
          tone: "warning",
        },
        {
          label: "Attivita allenamento",
          value: loading
            ? "..."
            : inbox.planItems.length + (inbox.trainingPlanItems?.length ?? 0),
          tone: "success",
        },
      ]}
    >
      {authHint && <div className="pf-alert warning">{authHint}</div>}
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Approvazioni per atleta</h2>
            <p className="pf-muted">
              Ogni blocco mostra esattamente cosa blocca la pubblicazione
              dell'amministratore.
            </p>
          </div>
          <StatusBadge tone={totalPending ? "warning" : "success"}>
            {totalPending} in attesa
          </StatusBadge>
        </div>

        <div className="pf-stack">
          {groups.map((group) => (
            <article key={group.user.id} className="pf-card pf-review-card">
              <div className="pf-card-top">
                <div>
                  <h3>{group.user.email}</h3>
                  <p className="pf-muted">
                    {group.questions.length} questionari - {group.plans.length}{" "}
                    attivita area -{" "}
                    {group.trainingQuestions.length +
                      group.trainingPlans.length}{" "}
                    revisioni allenatore
                  </p>
                </div>
                <div className="pf-actions">
                  <Link
                    className="pf-button-secondary"
                    href={`/professional/users/${group.user.id}/performance`}
                  >
                    Profilo
                  </Link>
                </div>
              </div>

              {group.questions.map((approval) => {
                const summary =
                  approval.questionSet.planRelease?.aiContextSummaries?.[0];
                return (
                  <div key={approval.id} className="pf-review-section">
                    <div className="pf-card-top">
                      <div>
                        <h4>{approval.area?.name ?? "Area"} questionario</h4>
                        <p className="pf-muted">
                          Ciclo v
                          {approval.questionSet.planRelease?.version ?? "-"} -{" "}
                          {summary
                            ? formatDate(summary.createdAt)
                            : "Proposta AI"}
                        </p>
                      </div>
                      <StatusBadge tone="warning">In attesa</StatusBadge>
                    </div>
                    {summary && (
                      <p className="pf-muted">
                        Sintesi AI: {summary.summaryText}
                      </p>
                    )}
                    <div className="pf-stack compact">
                      {approval.questionSet.questions.map((question) => (
                        <div key={question.id} className="pf-question-preview">
                          <strong>
                            {question.orderIndex}. {question.text}
                          </strong>
                          <span>
                            {question.options
                              .map((option) => option.label)
                              .join(" - ")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <label className="pf-field">
                      Motivo del rifiuto
                      <input
                        className="pf-input"
                        value={rejectReasons[approval.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [approval.id]: event.target.value,
                          }))
                        }
                        placeholder="Obbligatorio solo in caso di rifiuto"
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-button-danger"
                        type="button"
                        disabled={busyIds[approval.id]}
                        onClick={() =>
                          rejectQuestionSet(approval.questionSetId, approval.id)
                        }
                      >
                        Rifiuta questionario
                      </button>
                      <button
                        className="pf-button"
                        type="button"
                        disabled={busyIds[approval.id]}
                        onClick={() =>
                          approveQuestionSet(
                            approval.questionSetId,
                            approval.id,
                          )
                        }
                      >
                        Approva questionario
                      </button>
                    </div>
                  </div>
                );
              })}

              {group.plans.map((item) => {
                const summary = item.planRelease.aiContextSummaries?.[0];
                return (
                  <div key={item.id} className="pf-review-section">
                    <div className="pf-card-top">
                      <div>
                        <h4>{item.title}</h4>
                        <p className="pf-muted">
                          {item.area?.name ?? "Area"} - Ciclo v
                          {item.planRelease.version}
                        </p>
                      </div>
                      <StatusBadge tone="warning">Proposto</StatusBadge>
                    </div>
                    <p>{item.body}</p>
                    {summary && (
                      <p className="pf-muted">
                        Sintesi AI: {summary.summaryText}
                      </p>
                    )}
                    <label className="pf-field">
                      Motivo del rifiuto
                      <input
                        className="pf-input"
                        value={rejectReasons[item.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Obbligatorio solo in caso di rifiuto"
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-button-danger"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => rejectPlanItem(item.id)}
                      >
                        Rifiuta attivita
                      </button>
                      <button
                        className="pf-button"
                        type="button"
                        disabled={busyIds[item.id]}
                        onClick={() => approvePlanItem(item.id)}
                      >
                        Approva attivita
                      </button>
                    </div>
                  </div>
                );
              })}

              {group.trainingQuestions.map((approval) => (
                <div key={approval.id} className="pf-review-section">
                  <div className="pf-card-top">
                    <div>
                      <h4>Questionario allenamento</h4>
                      <p className="pf-muted">
                        {approval.questionSet.specialization.sport.label} -{" "}
                        {approval.questionSet.specialization.label} - v
                        {approval.questionSet.trainingPlanRelease.version}
                      </p>
                    </div>
                    <StatusBadge tone="warning">In attesa</StatusBadge>
                  </div>
                  <p className="pf-muted">
                    Sintesi AI:{" "}
                    {approval.questionSet.trainingPlanRelease.summaryText}
                  </p>
                  <div className="pf-stack compact">
                    {approval.questionSet.questions.map((question) => (
                      <div key={question.id} className="pf-question-preview">
                        <strong>
                          {question.orderIndex}. {question.text}
                        </strong>
                        <span>
                          {question.options
                            .map((option) => option.label)
                            .join(" - ")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <label className="pf-field">
                    Motivo del rifiuto
                    <input
                      className="pf-input"
                      value={rejectReasons[approval.id] ?? ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [approval.id]: event.target.value,
                        }))
                      }
                      placeholder="Obbligatorio solo in caso di rifiuto"
                    />
                  </label>
                  <div className="pf-actions">
                    <button
                      className="pf-button-danger"
                      type="button"
                      disabled={busyIds[approval.id]}
                      onClick={() =>
                        rejectTrainingQuestionSet(
                          approval.trainingQuestionSetId,
                          approval.id,
                        )
                      }
                    >
                      Rifiuta questionario
                    </button>
                    <button
                      className="pf-button"
                      type="button"
                      disabled={busyIds[approval.id]}
                      onClick={() =>
                        approveTrainingQuestionSet(
                          approval.trainingQuestionSetId,
                          approval.id,
                        )
                      }
                    >
                      Approva questionario
                    </button>
                  </div>
                </div>
              ))}

              {group.trainingPlans.map((item) => (
                <div key={item.id} className="pf-review-section">
                  <div className="pf-card-top">
                    <div>
                      <h4>{item.title}</h4>
                      <p className="pf-muted">
                        {item.trainingPlanRelease.specialization.sport.label} -{" "}
                        {item.trainingPlanRelease.specialization.label} - v
                        {item.trainingPlanRelease.version}
                      </p>
                    </div>
                    <StatusBadge tone="warning">Proposto</StatusBadge>
                  </div>
                  <p>{item.body}</p>
                  <label className="pf-field">
                    Motivo del rifiuto
                    <input
                      className="pf-input"
                      value={rejectReasons[item.id] ?? ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder="Obbligatorio solo in caso di rifiuto"
                    />
                  </label>
                  <div className="pf-actions">
                    <button
                      className="pf-button-danger"
                      type="button"
                      disabled={busyIds[item.id]}
                      onClick={() => rejectTrainingPlanItem(item.id)}
                    >
                      Rifiuta esercizio
                    </button>
                    <button
                      className="pf-button"
                      type="button"
                      disabled={busyIds[item.id]}
                      onClick={() => approveTrainingPlanItem(item.id)}
                    >
                      Approva esercizio
                    </button>
                  </div>
                </div>
              ))}
            </article>
          ))}

          {!loading && groups.length === 0 && (
            <EmptyState
              title="Nessuna approvazione"
              description="Nessun atleta collegato ha questionari o attivita in attesa di revisione."
            />
          )}
        </div>
      </section>
    </ProductShell>
  );
}
