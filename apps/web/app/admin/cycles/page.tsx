"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
type UserRef = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};
type Professional = UserRef & {
  professionalAreaCompetences: Array<{ areaId: string; area: Area }>;
  professionalLinks: Array<{
    userId: string;
    user: UserRef;
    createdAt: string;
  }>;
};
type Cycle = {
  id: string;
  userId: string;
  areaId: string;
  version: number;
  status?: string;
  cycleStatus: string;
  createdAt: string;
  user: UserRef;
  area: Area;
  items?: Array<{ id: string; status: string }>;
  questionSets?: Array<{
    id: string;
    status: string;
    approvals: Array<{ id: string; status: string; professional: UserRef }>;
  }>;
};
type AreaState = {
  area: Area;
  snapshot?: { realR: number; potentialP: number } | null;
  pendingCycle?: Cycle | null;
  activeCycle?: Cycle | null;
  currentQuestionSet?: { id: string; status: string } | null;
  linkedProfessional?: UserRef | null;
  generationReady: boolean;
  generationBlocked: boolean;
  reason: string;
};
type Athlete = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  createdAt: string;
  onboarding: { status: string; completedAt?: string | null };
  linkedProfessionals: Array<{
    area: Area;
    professional: UserRef;
    createdAt: string;
  }>;
  latestSnapshot?: { rankingGlobal: number; createdAt: string } | null;
  areaStates: AreaState[];
};
type Dashboard = {
  areas: Area[];
  athletes: Athlete[];
  professionals: Professional[];
  pendingCycles: Cycle[];
  readyCycles: Cycle[];
  pendingQuestionApprovals: Array<{
    id: string;
    professional: UserRef;
    currentProfessional?: UserRef | null;
    routingMismatch?: boolean;
    area: Area;
    questionSet: { id: string; user: UserRef; planReleaseId: string };
  }>;
  pendingPlanItems: Array<{
    id: string;
    area: Area;
    planReleaseId: string;
    user: UserRef;
    professional?: UserRef | null;
  }>;
};

type AiPreview = {
  provider: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: {
    prompt?: {
      system?: string;
      user?: {
        task?: string;
        constraints?: unknown;
        context?: unknown;
      };
      responseJsonSchema?: unknown;
    };
    [key: string]: unknown;
  };
};

type PreviewTarget = {
  athlete: UserRef;
  area: Area;
};

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    return Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? data.error ?? `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
};

const badgeTone = (value: string) => {
  if (
    value.includes("READY") ||
    value.includes("COMPLETED") ||
    value.includes("ACTIVE")
  ) {
    return "success" as const;
  }
  if (value.includes("WAITING") || value.includes("PENDING")) {
    return "warning" as const;
  }
  if (value.includes("REJECTED") || value.includes("MISSING")) {
    return "danger" as const;
  }
  return "neutral" as const;
};

const displayUser = (user: UserRef) => {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName ? `${fullName} · ${user.email}` : user.email;
};

export default function AdminCyclesPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedAreaByAthlete, setSelectedAreaByAthlete] = useState<
    Record<string, string>
  >({});
  const [selectedProfessionalByAthlete, setSelectedProfessionalByAthlete] =
    useState<Record<string, string>>({});
  const [competencesByProfessional, setCompetencesByProfessional] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );

  const athletes = dashboard?.athletes ?? [];
  const professionals = dashboard?.professionals ?? [];
  const areas = dashboard?.areas ?? [];
  const readyToGenerate = useMemo(
    () =>
      athletes.flatMap((athlete) =>
        athlete.areaStates
          .filter((state) => state.generationReady && !state.generationBlocked)
          .map((state) => ({ athlete, state })),
      ),
    [athletes],
  );
  const waitingApproval =
    dashboard?.pendingCycles.filter(
      (cycle) => cycle.cycleStatus !== "READY_TO_PUBLISH",
    ) ?? [];
  const readyCycles = dashboard?.readyCycles ?? [];
  const pendingActivation = athletes.filter((athlete) => !athlete.isActive);
  const selectionKey = (athleteId: string, areaId: string) =>
    `${athleteId}:${areaId}`;
  const professionalCanHandleArea = (professionalId: string, areaId: string) =>
    Boolean(
      professionals
        .find((professional) => professional.id === professionalId)
        ?.professionalAreaCompetences.some(
          (competence) => competence.areaId === areaId,
        ),
    );
  const enabledProfessionalsForArea = (areaId: string) =>
    areaId
      ? professionals.filter((professional) =>
          professional.professionalAreaCompetences.some(
            (competence) => competence.areaId === areaId,
          ),
        )
      : [];

  const loadDashboard = async () => {
    setLoading(true);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/dashboard`, {
      credentials: "include",
    });
    if (!response.ok) {
      setMessage(
        response.status === 403
          ? "Admin access required."
          : `Dashboard load failed: ${await readError(response)}`,
      );
      setLoading(false);
      return;
    }

    const data = (await response.json()) as Dashboard;
    setDashboard(data);
    setSelectedAreaByAthlete((current) => ({
      ...Object.fromEntries(
        data.athletes.map((athlete) => {
          const firstReadyArea = athlete.areaStates.find(
            (state) => state.generationReady && !state.generationBlocked,
          )?.area.id;
          const firstArea = athlete.areaStates[0]?.area.id ?? "";
          return [
            athlete.id,
            current[athlete.id] || firstReadyArea || firstArea,
          ];
        }),
      ),
    }));
    setSelectedProfessionalByAthlete(
      Object.fromEntries(
        data.athletes.flatMap((athlete) =>
          athlete.areaStates.map((state) => [
            selectionKey(athlete.id, state.area.id),
            state.linkedProfessional?.id ?? "",
          ]),
        ),
      ),
    );
    setCompetencesByProfessional(
      Object.fromEntries(
        data.professionals.map((professional) => [
          professional.id,
          Object.fromEntries(
            professional.professionalAreaCompetences.map((competence) => [
              competence.areaId,
              true,
            ]),
          ),
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const assignProfessional = async (athleteId: string) => {
    const areaId = selectedAreaByAthlete[athleteId];
    const professionalId =
      selectedProfessionalByAthlete[selectionKey(athleteId, areaId)];
    if (!areaId) {
      setMessage("Select an area before assigning a professional.");
      return;
    }
    if (!professionalId) {
      setMessage("Select a professional before assigning.");
      return;
    }
    if (!professionalCanHandleArea(professionalId, areaId)) {
      setMessage("Selected professional is not enabled for this area.");
      return;
    }
    setBusyKey(`link:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: athleteId, professionalId, areaId }),
    });
    if (!response.ok) {
      setMessage(`Assignment failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Athlete assigned to an enabled professional. Previous professional links were replaced.",
    );
    await loadDashboard();
    setBusyKey(null);
  };

  const saveCompetences = async (professionalId: string) => {
    const selected = Object.entries(
      competencesByProfessional[professionalId] ?? {},
    )
      .filter(([, checked]) => checked)
      .map(([areaId]) => areaId);
    if (!selected.length) {
      setMessage("Select at least one area competence.");
      return;
    }
    setBusyKey(`competences:${professionalId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/competences`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, areaIds: selected }),
    });
    if (!response.ok) {
      setMessage(`Competence update failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Competences saved. The professional sees linked athletes and matching approvals.",
    );
    await loadDashboard();
    setBusyKey(null);
  };

  const openAiPreview = async (athlete: UserRef, area: Area) => {
    setBusyKey(`preview:${athlete.id}:${area.id}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/orchestrator/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [athlete.id],
          areaId: area.id,
          runAllAreas: false,
        }),
      },
    );
    if (!response.ok) {
      setMessage(`AI preview failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setAiPreview((await response.json()) as AiPreview);
    setPreviewTarget({ athlete, area });
    setBusyKey(null);
  };

  const closeAiPreview = () => {
    setAiPreview(null);
    setPreviewTarget(null);
  };

  const generateCycle = async (athleteId: string, areaId: string) => {
    setBusyKey(`generate:${athleteId}:${areaId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/admin/orchestrator/run`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: [athleteId],
        areaId,
        runAllAreas: false,
      }),
    });
    if (!response.ok) {
      setMessage(`AI generation failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("AI proposal generated and sent to professional approval.");
    closeAiPreview();
    await loadDashboard();
    setBusyKey(null);
  };

  const publishCycle = async (cycleId: string) => {
    setBusyKey(`publish:${cycleId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/cycles/${cycleId}/publish`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Publish failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Cycle published. Athlete now sees plan and questionnaire.");
    await loadDashboard();
    setBusyKey(null);
  };

  const closeAnsweredQuestionnaires = async () => {
    setBusyKey("maintenance:close-questionnaires");
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/maintenance/close-answered-questionnaires`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Maintenance failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    const result = (await response.json()) as {
      scanned: number;
      closedCount: number;
    };
    setMessage(
      `Maintenance completed: ${result.closedCount}/${result.scanned} published questionnaires closed.`,
    );
    await loadDashboard();
    setBusyKey(null);
  };

  const setAthleteActive = async (athleteId: string, active: boolean) => {
    setBusyKey(`active:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/users/${athleteId}/${active ? "activate" : "deactivate"}`,
      {
        method: "PATCH",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Athlete update failed: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(active ? "Athlete enabled." : "Athlete disabled.");
    await loadDashboard();
    setBusyKey(null);
  };

  return (
    <ProductShell
      eyebrow="Admin workspace"
      title="Operations dashboard"
      description="Assign one professional per athlete area, generate AI cycles when athletes are ready, track approvals, and publish without copying IDs."
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={closeAnsweredQuestionnaires}
            disabled={busyKey === "maintenance:close-questionnaires"}
          >
            Close submitted questionnaires
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard()}
          >
            Refresh
          </button>
        </>
      }
      stats={[
        {
          label: "Ready to generate",
          value: loading ? "..." : readyToGenerate.length,
          tone: "accent",
        },
        {
          label: "Waiting approvals",
          value: loading ? "..." : waitingApproval.length,
          tone: "warning",
        },
        {
          label: "Ready to publish",
          value: loading ? "..." : readyCycles.length,
          tone: "success",
        },
        {
          label: "Pending activation",
          value: loading ? "..." : pendingActivation.length,
          tone: pendingActivation.length ? "danger" : "neutral",
        },
      ]}
    >
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>New athlete requests</h2>
            <p className="pf-muted">
              Athletes created from the public entry point must be enabled by an
              admin before they can log in and complete onboarding.
            </p>
          </div>
          <StatusBadge tone={pendingActivation.length ? "danger" : "success"}>
            {pendingActivation.length} pending
          </StatusBadge>
        </div>
        <div className="pf-table">
          {pendingActivation.map((athlete) => (
            <article key={athlete.id} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">
                  Created {formatDate(athlete.createdAt)} · onboarding{" "}
                  {athlete.onboarding.status.toLowerCase()}
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === `active:${athlete.id}`}
                onClick={() => setAthleteActive(athlete.id, true)}
              >
                Enable athlete
              </button>
            </article>
          ))}
          {!loading && pendingActivation.length === 0 && (
            <EmptyState
              title="No pending athlete"
              description="New athlete registration requests will appear here."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>AI generation queue</h2>
            <p className="pf-muted">
              Athletes with completed onboarding and areas that can receive a
              new AI proposal.
            </p>
          </div>
          <StatusBadge tone={readyToGenerate.length ? "accent" : "neutral"}>
            {readyToGenerate.length} ready
          </StatusBadge>
        </div>
        <div className="pf-table">
          {readyToGenerate.map(({ athlete, state }) => {
            const linkedProfessionalCanApprove = Boolean(
              state.linkedProfessional &&
              professionalCanHandleArea(
                state.linkedProfessional.id,
                state.area.id,
              ),
            );
            return (
              <article
                key={`${athlete.id}:${state.area.id}`}
                className="pf-work-row"
              >
                <div>
                  <strong>{displayUser(athlete)}</strong>
                  <p className="pf-muted">
                    {state.area.name} · {state.reason}
                  </p>
                  {!linkedProfessionalCanApprove && (
                    <p className="pf-muted">
                      Assign a professional enabled for {state.area.name} before
                      generating.
                    </p>
                  )}
                </div>
                <div className="pf-inline-metrics">
                  <span>R {state.snapshot?.realR.toFixed(0) ?? "-"}</span>
                  <span>P {state.snapshot?.potentialP.toFixed(0) ?? "-"}</span>
                </div>
                <button
                  className="pf-button"
                  type="button"
                  disabled={
                    busyKey === `preview:${athlete.id}:${state.area.id}` ||
                    !linkedProfessionalCanApprove
                  }
                  onClick={() => openAiPreview(athlete, state.area)}
                >
                  Preview AI
                </button>
              </article>
            );
          })}
          {!loading && readyToGenerate.length === 0 && (
            <EmptyState
              title="Nothing to generate"
              description="No completed athlete area is available for a new proposal right now."
            />
          )}
        </div>
      </section>

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Ready to publish</h2>
              <p className="pf-muted">
                Professional checks are complete. Admin publication activates
                the cycle.
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
                      {displayUser(cycle.user)} · v{cycle.version} ·{" "}
                      {formatDate(cycle.createdAt)}
                    </p>
                  </div>
                  <StatusBadge tone="success">Ready</StatusBadge>
                </div>
                <div className="pf-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={busyKey === `publish:${cycle.id}`}
                    onClick={() => publishCycle(cycle.id)}
                  >
                    Publish
                  </button>
                </div>
              </div>
            ))}
            {!loading && readyCycles.length === 0 && (
              <EmptyState
                title="No cycle ready"
                description="Approved cycles will appear here for one-click publication."
              />
            )}
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Approval load</h2>
              <p className="pf-muted">
                Who needs to act before admin can publish.
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
                      {displayUser(approval.questionSet.user)} · {approval.area.name}
                    {approval.routingMismatch ? " · reassigned" : ""}
                  </small>
                </span>
                <StatusBadge tone="warning">Questionnaire</StatusBadge>
              </div>
            ))}
            {(dashboard?.pendingPlanItems ?? []).map((item) => (
              <div key={item.id} className="pf-metric-row">
                <span>
                  {item.professional?.email ?? "Unassigned professional"}
                  <br />
                  <small>
                    {displayUser(item.user)} · {item.area.name}
                  </small>
                </span>
                <StatusBadge tone="warning">Plan item</StatusBadge>
              </div>
            ))}
            {!loading &&
              !(
                dashboard?.pendingQuestionApprovals.length ||
                dashboard?.pendingPlanItems.length
              ) && (
                <EmptyState
                  title="No pending approval"
                  description="Professionals have no open review tasks."
                />
              )}
          </div>
        </article>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Athlete ownership</h2>
            <p className="pf-muted">
              Assign one professional per athlete and area. Reassigning an area
              replaces only that area owner.
            </p>
          </div>
        </div>
        <div className="pf-grid pf-ownership-grid">
          {athletes.map((athlete) => {
            const selectedAreaId =
              selectedAreaByAthlete[athlete.id] ??
              athlete.areaStates[0]?.area.id ??
              "";
            const eligibleProfessionals =
              enabledProfessionalsForArea(selectedAreaId);
            const selectedKey = selectionKey(athlete.id, selectedAreaId);
            const selectedAreaState = athlete.areaStates.find(
              (state) => state.area.id === selectedAreaId,
            );
            const selectedProfessionalId =
              selectedProfessionalByAthlete[selectedKey] ?? "";
            const selectedProfessionalStillEligible =
              !selectedProfessionalId ||
              professionalCanHandleArea(selectedProfessionalId, selectedAreaId);
            const assignedCount = athlete.areaStates.filter(
              (state) => state.linkedProfessional,
            ).length;

            return (
              <article key={athlete.id} className="pf-card pf-ownership-card">
                <div className="pf-card-top pf-ownership-header">
                  <div>
                    <h3>{displayUser(athlete)}</h3>
                    <p className="pf-muted pf-athlete-meta">
                      {athlete.isActive ? "Enabled" : "Pending activation"} ·
                      onboarding {athlete.onboarding.status.toLowerCase()} ·
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
                      ? "pending"
                      : `${assignedCount}/${athlete.areaStates.length} assigned`}
                  </StatusBadge>
                </div>
                <div className="pf-ownership-fields">
                  <label className="pf-field">
                    Ambito
                    <select
                      className="pf-select"
                      value={selectedAreaId}
                      onChange={(event) => {
                        const nextAreaId = event.target.value;
                        setSelectedAreaByAthlete((prev) => ({
                          ...prev,
                          [athlete.id]: nextAreaId,
                        }));
                        setSelectedProfessionalByAthlete((prev) => {
                          const currentProfessionalId =
                            prev[selectionKey(athlete.id, nextAreaId)] ?? "";
                          if (
                            currentProfessionalId &&
                            !professionalCanHandleArea(
                              currentProfessionalId,
                              nextAreaId,
                            )
                          ) {
                            return {
                              ...prev,
                              [selectionKey(athlete.id, nextAreaId)]: "",
                            };
                          }
                          return prev;
                        });
                      }}
                    >
                      {athlete.areaStates.map((state) => (
                        <option key={state.area.id} value={state.area.id}>
                          {state.area.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pf-field">
                    Professionista abilitato
                    <select
                      className="pf-select"
                      value={
                        selectedProfessionalStillEligible
                          ? selectedProfessionalId
                          : ""
                      }
                      onChange={(event) =>
                        setSelectedProfessionalByAthlete((prev) => ({
                          ...prev,
                          [selectedKey]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {eligibleProfessionals.length
                          ? "Select professional"
                          : "No professional enabled for this area"}
                      </option>
                      {eligibleProfessionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p
                  className={`pf-muted pf-owner-note ${
                    selectedAreaState?.linkedProfessional ? "" : "empty"
                  }`}
                >
                  {selectedAreaState?.linkedProfessional ? (
                    <>
                      Current {selectedAreaState.area.name} owner:{" "}
                      {selectedAreaState.linkedProfessional.email}
                    </>
                  ) : (
                    "No owner assigned for this area"
                  )}
                </p>
                <div className="pf-ownership-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={
                      busyKey === `link:${athlete.id}` ||
                      !selectedAreaId ||
                      !selectedProfessionalByAthlete[selectedKey] ||
                      !selectedProfessionalStillEligible
                    }
                    onClick={() => assignProfessional(athlete.id)}
                  >
                    Associate professional
                  </button>
                  <button
                    className="pf-button-secondary"
                    type="button"
                    disabled={busyKey === `active:${athlete.id}`}
                    onClick={() =>
                      setAthleteActive(athlete.id, !athlete.isActive)
                    }
                  >
                    {athlete.isActive ? "Disable athlete" : "Enable athlete"}
                  </button>
                </div>
                <div className="pf-area-strip">
                  {athlete.areaStates.map((state) => (
                    <span
                      key={state.area.id}
                      className={`pf-area-pill ${state.pendingCycle ? "pending" : state.generationReady ? "ready" : ""}`}
                    >
                      {state.area.name}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Professional competences</h2>
            <p className="pf-muted">
              Approval routing uses area competence. Keep it explicit and
              visible.
            </p>
          </div>
        </div>
        <div className="pf-grid">
          {professionals.map((professional) => (
            <article key={professional.id} className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>{professional.email}</h3>
                  <p className="pf-muted">
                    {professional.professionalLinks.length} athlete
                    {professional.professionalLinks.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="pf-checkbox-grid">
                {areas.map((area) => (
                  <label key={area.id} className="pf-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        competencesByProfessional[professional.id]?.[area.id],
                      )}
                      onChange={(event) =>
                        setCompetencesByProfessional((prev) => ({
                          ...prev,
                          [professional.id]: {
                            ...(prev[professional.id] ?? {}),
                            [area.id]: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>{area.name}</span>
                  </label>
                ))}
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `competences:${professional.id}`}
                onClick={() => saveCompetences(professional.id)}
              >
                Save competences
              </button>
            </article>
          ))}
        </div>
      </section>

      {aiPreview && previewTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">AI preview</p>
                <h2>Context sent to AI</h2>
                <p className="pf-muted">
                  {previewTarget.athlete.email} · {previewTarget.area.name} ·{" "}
                  {aiPreview.provider}/{aiPreview.model}
                </p>
              </div>
              <StatusBadge tone="accent">{aiPreview.promptVersion}</StatusBadge>
            </div>

            <div className="pf-dashboard-grid">
              <article className="pf-review-section">
                <h4>System instruction</h4>
                <p className="pf-muted">
                  {aiPreview.inputJson.prompt?.system ?? "-"}
                </p>
              </article>
              <article className="pf-review-section">
                <h4>Generation rules</h4>
                <pre className="pf-json-preview">
                  {JSON.stringify(
                    aiPreview.inputJson.prompt?.user?.constraints ?? {},
                    null,
                    2,
                  )}
                </pre>
              </article>
            </div>

            <article className="pf-review-section">
              <h4>Athlete context</h4>
              <pre className="pf-json-preview">
                {JSON.stringify(
                  aiPreview.inputJson.prompt?.user?.context ?? {},
                  null,
                  2,
                )}
              </pre>
            </article>

            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                disabled={
                  busyKey ===
                  `generate:${previewTarget.athlete.id}:${previewTarget.area.id}`
                }
                onClick={() =>
                  generateCycle(previewTarget.athlete.id, previewTarget.area.id)
                }
              >
                Confirm and send to AI
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAiPreview}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
