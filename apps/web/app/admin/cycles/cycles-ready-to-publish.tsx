"use client";

import { EmptyState, StatusBadge } from "@/app/components/product-shell";
import { displayUser, formatDate } from "./admin-cycles-model";
import type { AdminCyclesModel } from "./use-admin-cycles";
export function CyclesReadyToPublish({ model }: { model: AdminCyclesModel }) {
  const {
    dashboard,
    loading,
    busyKey,
    readyCycles,
    readyTrainingPlans,
    publishCycle,
    publishTrainingPlan,
  } = model;
  return (
    <section className="pf-dashboard-grid">
      <article className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Pronti da pubblicare</h2>
            <p className="pf-muted">
              I controlli dei professionisti sono completati. La pubblicazione
              dell'amministratore attiva il ciclo.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {readyCycles.map((cycle) => (
            <div key={cycle.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{cycle.area.name}</h3>
                  <p className="pf-muted">
                    {displayUser(cycle.user)} - v{cycle.version} -{" "}
                    {formatDate(cycle.createdAt)}
                  </p>
                </div>
                <StatusBadge tone="success">Pronto</StatusBadge>
              </div>
              <div className="pf-actions">
                <button
                  className="pf-button"
                  type="button"
                  disabled={busyKey === `publish:${cycle.id}`}
                  onClick={() => publishCycle(cycle.id)}
                >
                  Pubblica
                </button>
              </div>
            </div>
          ))}
          {readyTrainingPlans.map((training) => (
            <div key={training.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>
                    {training.specialization.sport.label} -{" "}
                    {training.specialization.label}
                  </h3>
                  <p className="pf-muted">
                    {displayUser(training.user)} - v{training.version} -{" "}
                    {formatDate(training.createdAt)}
                  </p>
                </div>
                <StatusBadge tone="success">Allenamento pronto</StatusBadge>
              </div>
              <div className="pf-actions">
                <button
                  className="pf-button"
                  type="button"
                  disabled={busyKey === `training-publish:${training.id}`}
                  onClick={() => publishTrainingPlan(training.id)}
                >
                  Pubblica allenamento
                </button>
              </div>
            </div>
          ))}
          {!loading &&
            readyCycles.length === 0 &&
            readyTrainingPlans.length === 0 && (
              <EmptyState
                title="Nessun ciclo pronto"
                description="I cicli approvati appariranno qui per la pubblicazione diretta."
              />
            )}
        </div>
      </article>

      <article className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Carico approvazioni</h2>
            <p className="pf-muted">
              Chi deve agire prima che l'amministratore possa pubblicare.
            </p>
          </div>
        </div>
        <div className="pf-stack">
          {(dashboard?.pendingQuestionApprovals ?? []).map((approval) => (
            <div key={approval.id} className="pf-metric-row">
              <span>
                {approval.currentProfessional?.email ??
                  approval.professional.email}
                <br />
                <small>
                  {displayUser(approval.questionSet.user)} -{" "}
                  {approval.area.name}
                  {approval.routingMismatch ? " - riassegnato" : ""}
                </small>
              </span>
              <StatusBadge tone="warning">Questionario</StatusBadge>
            </div>
          ))}
          {(dashboard?.pendingPlanItems ?? []).map((item) => (
            <div key={item.id} className="pf-metric-row">
              <span>
                {item.professional?.email ?? "Professionista non assegnato"}
                <br />
                <small>
                  {displayUser(item.user)} - {item.area.name}
                </small>
              </span>
              <StatusBadge tone="warning">Attivita allenamento</StatusBadge>
            </div>
          ))}
          {(dashboard?.pendingTrainingPlans ?? []).map((training) => {
            const approval = training.questionSets[0]?.approvals[0];
            return (
              <div key={training.id} className="pf-metric-row">
                <span>
                  {approval?.coach.email ?? "Allenatore non assegnato"}
                  <br />
                  <small>
                    {displayUser(training.user)} -{" "}
                    {training.specialization.sport.label} /{" "}
                    {training.specialization.label}
                  </small>
                </span>
                <StatusBadge tone="warning">Allenamento</StatusBadge>
              </div>
            );
          })}
          {!loading &&
            !(
              dashboard?.pendingQuestionApprovals.length ||
              dashboard?.pendingPlanItems.length ||
              dashboard?.pendingTrainingPlans.length
            ) && (
              <EmptyState
                title="Nessuna approvazione pendente"
                description="I professionisti non hanno revisioni aperte."
              />
            )}
        </div>
      </article>
    </section>
  );
}
