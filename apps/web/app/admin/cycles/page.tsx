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
  cycleStato: string;
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

type AssignmentTarget = {
  athlete: Athlete;
  state: AreaState;
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
    : parsed.toLocaleDateString("it-IT", {
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
  return fullName ? `${fullName} - ${user.email}` : user.email;
};

const formatStatus = (status: string) =>
  ({
    ACTIVE: "attivo",
    COMPLETED: "completato",
    CLOSED: "chiuso",
    PENDING: "in attesa",
    PUBLISHED: "pubblicato",
    READY_TO_PUBLISH: "pronto da pubblicare",
    WAITING_PROFESSIONAL_APPROVAL: "in attesa professionista",
  })[status] ?? status.replace(/_/g, " ").toLowerCase();

export default function AdminCyclesPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [competencesByProfessional, setCompetencesByProfessional] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );
  const [assignmentTarget, setAssignmentTarget] =
    useState<AssignmentTarget | null>(null);
  const [professionalFilter, setProfessionalFilter] = useState("");

  const athletes =
    dashboard?.athletes.filter(
      (athlete) => athlete.onboarding.status !== "REJECTED",
    ) ?? [];
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
      (cycle) => cycle.cycleStato !== "READY_TO_PUBLISH",
    ) ?? [];
  const readyCycles = dashboard?.readyCycles ?? [];
  const pendingActivation = athletes.filter(
    (athlete) => !athlete.isActive && athlete.onboarding.status !== "REJECTED",
  );
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
  const filteredAssignmentProfessionals = assignmentTarget
    ? enabledProfessionalsForArea(assignmentTarget.state.area.id).filter(
        (professional) =>
          displayUser(professional)
            .toLowerCase()
            .includes(professionalFilter.trim().toLowerCase()),
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
          ? "Accesso admin richiesto."
          : `Caricamento dashboard non riuscito: ${await readError(response)}`,
      );
      setLoading(false);
      return;
    }

    const data = (await response.json()) as Dashboard;
    setDashboard(data);
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

  const openAssignmentModal = (athlete: Athlete, state: AreaState) => {
    setAssignmentTarget({ athlete, state });
    setProfessionalFilter("");
  };

  const closeAssignmentModal = () => {
    setAssignmentTarget(null);
    setProfessionalFilter("");
  };

  const assignProfessional = async (
    athleteId: string,
    areaId: string,
    professionalId: string,
  ) => {
    if (!areaId) {
      setMessage("Seleziona un'area prima di assegnare un professionista.");
      return;
    }
    if (!professionalId) {
      setMessage("Seleziona un professionista prima dell'assegnazione.");
      return;
    }
    if (!professionalCanHandleArea(professionalId, areaId)) {
      setMessage("Il professionista selezionato non e abilitato per questa area.");
      return;
    }
    setBusyKey(`link:${athleteId}:${areaId}`);
    setMessage(null);
    const response = await secureFetch(`${API_BASE}/inspect/links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: athleteId, professionalId, areaId }),
    });
    if (!response.ok) {
      setMessage(`Assegnazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Atleta assegnato a un professionista abilitato. I collegamenti precedenti sono stati sostituiti.",
    );
    closeAssignmentModal();
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
      setMessage("Seleziona almeno una competenza per area.");
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
      setMessage(`Aggiornamento competenze non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(
      "Competenze salvate. Il professionista vede gli atleti collegati e le approvazioni coerenti.",
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
          runAllAree: false,
        }),
      },
    );
    if (!response.ok) {
      setMessage(`Anteprima AI non riuscita: ${await readError(response)}`);
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
        runAllAree: false,
      }),
    });
    if (!response.ok) {
      setMessage(`Generazione AI non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Proposta AI generata e inviata all'approvazione del professionista.");
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
      setMessage(`Pubblicazione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Ciclo pubblicato. L'atleta ora vede piano e questionario.");
    await loadDashboard();
    setBusyKey(null);
  };

  const closeRisposteQuestionari = async () => {
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
      setMessage(`Manutenzione non riuscita: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    const result = (await response.json()) as {
      scanned: number;
      closedCount: number;
    };
    setMessage(
      `Manutenzione completata: ${result.closedCount}/${result.scanned} questionari pubblicati chiusi.`,
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
      setMessage(`Aggiornamento atleta non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage(active ? "Atleta abilitato." : "Atleta disabilitato.");
    await loadDashboard();
    setBusyKey(null);
  };

  const rejectAthleteApplication = async (athleteId: string) => {
    setBusyKey(`reject:${athleteId}`);
    setMessage(null);
    const response = await secureFetch(
      `${API_BASE}/admin/users/${athleteId}/reject`,
      {
        method: "PATCH",
        credentials: "include",
      },
    );
    if (!response.ok) {
      setMessage(`Rifiuto candidatura non riuscito: ${await readError(response)}`);
      setBusyKey(null);
      return;
    }
    setMessage("Candidatura atleta rifiutata. L'utente potra riproporne una nuova.");
    await loadDashboard();
    setBusyKey(null);
  };

  return (
    <ProductShell
      eyebrow="Ambiente admin"
      title="Cruscotto operativo"
      description="Assegna un professionista per area atleta, genera cicli AI quando gli atleti sono pronti, traccia le approvazioni e pubblica senza copiare ID."
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={closeRisposteQuestionari}
            disabled={busyKey === "maintenance:close-questionnaires"}
          >
            Chiudi questionari inviati
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard()}
          >
            Aggiorna
          </button>
        </>
      }
      stats={[
        {
          label: "Pronti da generare",
          value: loading ? "..." : readyToGenerate.length,
          tone: "accent",
        },
        {
          label: "Approvazioni in attesa",
          value: loading ? "..." : waitingApproval.length,
          tone: "warning",
        },
        {
          label: "Pronti da pubblicare",
          value: loading ? "..." : readyCycles.length,
          tone: "success",
        },
        {
          label: "In attesa attivazione",
          value: loading ? "..." : pendingActivation.length,
          tone: pendingActivation.length ? "danger" : "neutral",
        },
      ]}
    >
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Nuove richieste atleta</h2>
            <p className="pf-muted">
              Gli atleti creati dall'accesso pubblico devono essere abilitati
              dall'admin prima di accedere e completare l'onboarding.
            </p>
          </div>
          <StatusBadge tone={pendingActivation.length ? "danger" : "success"}>
            {pendingActivation.length} in attesa
          </StatusBadge>
        </div>
        <div className="pf-table">
          {pendingActivation.map((athlete) => (
            <article key={athlete.id} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">
                  Creato il {formatDate(athlete.createdAt)} - onboarding{" "}
                  {formatStatus(athlete.onboarding.status)}
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === `active:${athlete.id}`}
                onClick={() => setAthleteActive(athlete.id, true)}
              >
                Abilita atleta
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `reject:${athlete.id}`}
                onClick={() => rejectAthleteApplication(athlete.id)}
              >
                Rifiuta candidatura
              </button>
            </article>
          ))}
          {!loading && pendingActivation.length === 0 && (
            <EmptyState
              title="Nessun atleta in attesa"
              description="Le nuove richieste di registrazione atleta appariranno qui."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Coda generazione AI</h2>
            <p className="pf-muted">
              Atleti con onboarding completato e aree pronte a ricevere una
              nuova proposta AI.
            </p>
          </div>
          <StatusBadge tone={readyToGenerate.length ? "accent" : "neutral"}>
            {readyToGenerate.length} pronti
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
                    {state.area.name} - {state.reason}
                  </p>
                  {!linkedProfessionalCanApprove && (
                    <p className="pf-muted">
                      Assegna un professionista abilitato per {state.area.name} prima
                      di generare.
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
                  Anteprima AI
                </button>
              </article>
            );
          })}
          {!loading && readyToGenerate.length === 0 && (
            <EmptyState
              title="Niente da generare"
              description="Al momento nessuna area atleta completata e disponibile per una nuova proposta."
            />
          )}
        </div>
      </section>

      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Pronti da pubblicare</h2>
              <p className="pf-muted">
                I controlli dei professionisti sono completati. La pubblicazione
                admin attiva il ciclo.
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
            {!loading && readyCycles.length === 0 && (
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
                Chi deve agire prima che l'admin possa pubblicare.
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
                      {displayUser(approval.questionSet.user)} - {approval.area.name}
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
                <StatusBadge tone="warning">Attivita piano</StatusBadge>
              </div>
            ))}
            {!loading &&
              !(
                dashboard?.pendingQuestionApprovals.length ||
                dashboard?.pendingPlanItems.length
              ) && (
                <EmptyState
                  title="Nessuna approvazione pendente"
                  description="I professionisti non hanno revisioni aperte."
                />
              )}
          </div>
        </article>
      </section>

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
        <div className="pf-grid pf-ownership-grid">
          {athletes.map((athlete) => {
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
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Competenze professionisti</h2>
            <p className="pf-muted">
              L'instradamento delle approvazioni usa le competenze per area.
              Mantienilo esplicito e visibile.
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
                    {professional.professionalLinks.length} atleti collegati
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
                Salva competenze
              </button>
            </article>
          ))}
        </div>
      </section>

      {assignmentTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-assignment-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Assegnazione area</p>
                <h2>Seleziona professionista</h2>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAssignmentModal}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-assignment-summary">
              <div>
                <span>Utente</span>
                <strong>{displayUser(assignmentTarget.athlete)}</strong>
              </div>
              <div>
                <span>Zona driver</span>
                <strong>{assignmentTarget.state.area.name}</strong>
              </div>
              <div>
                <span>Attualmente assegnato</span>
                <strong>
                  {assignmentTarget.state.linkedProfessional?.email ??
                    "Nessun professionista"}
                </strong>
              </div>
            </div>

            <label className="pf-field pf-combobox-field">
              Professionista
              <input
                className="pf-input"
                value={professionalFilter}
                onChange={(event) => setProfessionalFilter(event.target.value)}
                placeholder="Cerca per nome o email"
                role="combobox"
                aria-expanded="true"
                aria-controls="professional-assignment-options"
                autoFocus
                autoComplete="off"
              />
            </label>

            <div
              className="pf-combobox-menu"
              id="professional-assignment-options"
            >
              {filteredAssignmentProfessionals.map((professional) => (
                <button
                  key={professional.id}
                  className={`pf-combobox-option ${
                    assignmentTarget.state.linkedProfessional?.id ===
                    professional.id
                      ? "selected"
                      : ""
                  }`}
                  type="button"
                  disabled={
                    busyKey ===
                    `link:${assignmentTarget.athlete.id}:${assignmentTarget.state.area.id}`
                  }
                  onClick={() =>
                    assignProfessional(
                      assignmentTarget.athlete.id,
                      assignmentTarget.state.area.id,
                      professional.id,
                    )
                  }
                >
                  {displayUser(professional)}
                </button>
              ))}
              {!filteredAssignmentProfessionals.length && (
                <div className="pf-alert warning">
                  Nessun professionista abilitato trovato per questa area.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {aiPreview && previewTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Anteprima AI</p>
                <h2>Contesto inviato all'AI</h2>
                <p className="pf-muted">
                  {previewTarget.athlete.email} - {previewTarget.area.name} -{" "}
                  {aiPreview.provider}/{aiPreview.model}
                </p>
              </div>
              <StatusBadge tone="accent">{aiPreview.promptVersion}</StatusBadge>
            </div>

            <div className="pf-dashboard-grid">
              <article className="pf-review-section">
                <h4>Istruzione di sistema</h4>
                <p className="pf-muted">
                  {aiPreview.inputJson.prompt?.system ?? "-"}
                </p>
              </article>
              <article className="pf-review-section">
                <h4>Regole di generazione</h4>
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
              <h4>Contesto atleta</h4>
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
                Conferma e invia all'AI
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAiPreview}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
