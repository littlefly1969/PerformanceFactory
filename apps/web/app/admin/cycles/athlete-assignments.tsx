"use client";

import { DataTable } from "@/app/components/workspace/data-table";
import { StatusBadge } from "@/app/components/product-shell";
import { displayUser, formatStatus } from "./admin-cycles-model";
import type { AdminCyclesModel } from "./use-admin-cycles";
export function AthleteAssignments({ model }: { model: AdminCyclesModel }) {
  const {
    busyKey,
    setResetTarget,
    setDeleteTarget,
    setDeleteConfirmText,
    athletes,
    openAssignmentModal,
    openCoachAssignmentModal,
    setAthleteActive,
  } = model;
  return (
    <section className="pf-panel">
      <div className="pf-panel-header">
        <div>
          <h2>Assegnazione atleti</h2>
          <p className="pf-muted">
            Assegna un professionista per atleta e area. Riassegnando un'area
            viene sostituito solo il responsabile di quell'area.
          </p>
        </div>
      </div>
      <DataTable
        label="Assegnazione atleti"
        rows={athletes}
        rowKey={(a) => a.id}
        searchText={(a) =>
          `${displayUser(a)} ${a.email} ${formatStatus(a.onboarding.status)}`
        }
        columns={[
          {
            id: "athlete",
            label: "Atleta",
            value: (a) => displayUser(a),
            render: (a) => (
              <strong>
                {displayUser(a)}
                <small>{a.email}</small>
              </strong>
            ),
          },
          {
            id: "active",
            label: "Accesso",
            value: (a) => Number(a.isActive),
            render: (a) => (
              <StatusBadge tone={a.isActive ? "success" : "warning"}>
                {a.isActive ? "Abilitato" : "In attesa"}
              </StatusBadge>
            ),
          },
          {
            id: "onboarding",
            label: "Onboarding",
            value: (a) => a.onboarding.status,
            render: (a) => formatStatus(a.onboarding.status),
          },
          {
            id: "ranking",
            label: "Ranking",
            value: (a) => a.latestSnapshot?.rankingGlobal ?? 0,
            render: (a) => a.latestSnapshot?.rankingGlobal ?? "—",
          },
          {
            id: "areas",
            label: "Aree assegnate",
            value: (a) =>
              a.areaStates.filter((s) => s.linkedProfessional).length,
            render: (a) =>
              `${a.areaStates.filter((s) => s.linkedProfessional).length} / ${a.areaStates.length}`,
          },
        ]}
        renderDetails={(athlete) => {
          const assignedCount = athlete.areaStates.filter(
            (state) => state.linkedProfessional,
          ).length;

          return (
            <article key={athlete.id} className="pf-card pf-ownership-card">
              <div className="pf-card-top pf-ownership-header">
                <div>
                  <h3>{displayUser(athlete)}</h3>
                  <p className="pf-muted pf-athlete-meta">
                    {athlete.isActive ? "Abilitato" : "In attesa attivazione"} -
                    onboarding {formatStatus(athlete.onboarding.status)} -
                    ranking {athlete.latestSnapshot?.rankingGlobal ?? "-"}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    !athlete.isActive
                      ? "danger"
                      : assignedCount
                        ? "success"
                        : "warning"
                  }
                >
                  {!athlete.isActive
                    ? "in attesa"
                    : `${assignedCount}/${athlete.areaStates.length} assegnati`}
                </StatusBadge>
              </div>
              <div className="pf-ownership-actions">
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={busyKey === `active:${athlete.id}`}
                  onClick={() =>
                    setAthleteActive(athlete.id, !athlete.isActive)
                  }
                >
                  {athlete.isActive ? "Disabilita atleta" : "Abilita atleta"}
                </button>
                <button
                  className="pf-button-danger"
                  type="button"
                  disabled={busyKey === `reset:${athlete.id}`}
                  onClick={() => setResetTarget({ athlete })}
                >
                  Cancella dati
                </button>
                <button
                  className="pf-button-danger"
                  type="button"
                  disabled={busyKey === `delete:${athlete.id}`}
                  onClick={() => {
                    setDeleteTarget({ athlete });
                    setDeleteConfirmText("");
                  }}
                >
                  Elimina atleta
                </button>
              </div>
              <div className="pf-area-strip">
                {athlete.areaStates.map((state) => (
                  <button
                    key={state.area.id}
                    className={`pf-area-pill ${state.pendingCycle ? "pending" : state.generationReady ? "ready" : ""} ${
                      state.linkedProfessional ? "assigned" : ""
                    }`}
                    type="button"
                    onClick={() => openAssignmentModal(athlete, state)}
                  >
                    <span>{state.area.name}</span>
                  </button>
                ))}
                {athlete.trainingState.sportSelection && (
                  <button
                    className={`pf-area-pill ${
                      athlete.trainingState.generationReady ? "ready" : ""
                    } ${athlete.trainingState.linkedCoach ? "assigned" : ""}`}
                    type="button"
                    onClick={() =>
                      openCoachAssignmentModal(
                        athlete,
                        athlete.trainingState.sportSelection!.specializationId,
                        `${athlete.trainingState.sportSelection!.sport.label} - ${athlete.trainingState.sportSelection!.specialization.label}`,
                      )
                    }
                  >
                    <span>
                      Allenamento:{" "}
                      {athlete.trainingState.sportSelection.sport.label} -{" "}
                      {
                        athlete.trainingState.sportSelection.specialization
                          .label
                      }
                    </span>
                  </button>
                )}
              </div>
            </article>
          );
        }}
      />
    </section>
  );
}
