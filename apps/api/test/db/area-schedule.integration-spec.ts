import { randomUUID } from 'node:crypto';
import { lifecycleFixture } from './lifecycle-test-helper';
import { AbilityPlansService } from '../../src/ability-plans/ability-plans.service';
import { AbilityPlansWorker } from '../../src/ability-plans/ability-plans.worker';
import { TrainingLifecycleOrchestrator } from '../../src/training-lifecycle/training-lifecycle.orchestrator';

describe('Scheduled area calendar with PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  let lifecycle: TrainingLifecycleOrchestrator;
  let plans: AbilityPlansService;
  let worker: AbilityPlansWorker;
  let scheduledAreaId: string;
  let plainAreaId: string;
  let professionalId: string;

  beforeAll(async () => {
    f = await lifecycleFixture();
    lifecycle = f.app.get(TrainingLifecycleOrchestrator);
    plans = f.app.get(AbilityPlansService);
    worker = f.app.get(AbilityPlansWorker);
    await f.coach();
    professionalId = (await f.user('PROFESSIONAL')).id;
    const scheduled = await f.prisma.area.create({
      data: {
        name: `Preparazione atletica ${randomUUID()}`,
        sportSpecializationPrompts: {
          create: {
            specializationId: f.specializationId,
            basePrompt: 'Sedute di preparazione atletica per la finestra',
            isEnabledDriver: true,
            isScheduled: true,
          },
        },
        professionalAreaCompetences: { create: { professionalId } },
      },
    });
    scheduledAreaId = scheduled.id;
    const plain = await f.prisma.area.create({
      data: {
        name: `Nutrizione ${randomUUID()}`,
        sportSpecializationPrompts: {
          create: {
            specializationId: f.specializationId,
            basePrompt: 'Indicazioni nutrizionali',
            isEnabledDriver: true,
          },
        },
        professionalAreaCompetences: { create: { professionalId } },
      },
    });
    plainAreaId = plain.id;
  }, 60000);

  afterAll(async () => {
    if (!f) return;
    const area = { areaId: { in: [scheduledAreaId, plainAreaId] } };
    await f.prisma.areaSession.deleteMany({ where: area });
    await f.prisma.abilityPlanOperation.deleteMany({ where: area });
    await f.prisma.userAnswer.deleteMany({ where: { question: area } });
    await f.prisma.answerOption.deleteMany({ where: { question: area } });
    await f.prisma.question.deleteMany({ where: area });
    await f.prisma.questionSetAreaApproval.deleteMany({ where: area });
    await f.prisma.aiProposalAudit.deleteMany({ where: { planRelease: area } });
    await f.prisma.aiContextSummary.deleteMany({
      where: { planRelease: area },
    });
    await f.prisma.cycleAuditLog.deleteMany({ where: { planRelease: area } });
    await f.prisma.questionSet.deleteMany({ where: area });
    await f.prisma.planItem.deleteMany({ where: area });
    await f.prisma.improvementPlanRelease.deleteMany({ where: area });
    await f.prisma.professionalUserLink.deleteMany({ where: area });
    await f.prisma.professionalAreaCompetence.deleteMany({ where: area });
    await f.prisma.area.deleteMany({
      where: { id: { in: [scheduledAreaId, plainAreaId] } },
    });
    await f.cleanup();
  });

  /** Porta l'atleta fino alla finestra sportiva pubblicata. */
  async function publishTrainingWindow(userId: string) {
    await lifecycle.requestPlan(userId);
    const operation =
      await f.prisma.trainingLifecycleOperation.findFirstOrThrow({
        where: { userId, completedAt: null },
      });
    await lifecycle.resumeLifecycle(operation.id);
    return f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId, status: 'ACTIVE' },
      include: { sessions: { orderBy: { scheduledDate: 'asc' } } },
    });
  }

  async function runScheduled(userId: string) {
    const operations = await f.prisma.abilityPlanOperation.findMany({
      where: { userId, areaId: scheduledAreaId, completedAt: null },
    });
    for (const operation of operations) await worker.resume(operation.id);
    return operations;
  }

  it('non accoda l area a calendario con la richiesta piano, ma con la finestra pubblicata', async () => {
    const athlete = await f.user();
    await plans.request(athlete.id);
    expect(
      await f.prisma.abilityPlanOperation.count({
        where: { userId: athlete.id, areaId: scheduledAreaId },
      }),
    ).toBe(0);
    expect(
      await f.prisma.abilityPlanOperation.count({
        where: { userId: athlete.id, areaId: plainAreaId },
      }),
    ).toBe(1);

    const training = await publishTrainingWindow(athlete.id);
    const queued = await f.prisma.abilityPlanOperation.findMany({
      where: { userId: athlete.id, areaId: scheduledAreaId },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0].trainingReleaseId).toBe(training.id);
  });

  it('pubblica sedute datate solo nei giorni liberi e le espone nel calendario', async () => {
    const athlete = await f.user();
    const training = await publishTrainingWindow(athlete.id);
    await runScheduled(athlete.id);

    const release = await f.prisma.improvementPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id, areaId: scheduledAreaId },
      include: { sessions: { orderBy: { scheduledDate: 'asc' } } },
    });
    expect(release.status).toBe('ACTIVE');
    expect(release.trainingReleaseId).toBe(training.id);
    expect(release.startsOn).toEqual(training.startsOn);
    expect(release.endsOn).toEqual(training.endsOn);
    expect(release.sessions.length).toBeGreaterThan(0);

    const sportDays = training.sessions.map((s) =>
      s.scheduledDate.toISOString().slice(0, 10),
    );
    const areaDays = release.sessions.map((s) =>
      s.scheduledDate.toISOString().slice(0, 10),
    );
    expect(areaDays.some((day) => sportDays.includes(day))).toBe(false);
    expect(new Set(areaDays).size).toBe(areaDays.length);
    for (const day of areaDays) {
      expect(day >= training.startsOn!.toISOString().slice(0, 10)).toBe(true);
      expect(day <= training.endsOn!.toISOString().slice(0, 10)).toBe(true);
    }

    const response = await f.app.inject({
      method: 'GET',
      url: `/api/athlete/training/calendar?from=${training
        .startsOn!.toISOString()
        .slice(0, 10)}&to=${training.endsOn!.toISOString().slice(0, 10)}`,
      headers: athlete.headers,
    });
    expect(response.statusCode).toBe(200);
    const calendar = response.json<{
      sessions: { id: string; track: string; areaName: string | null }[];
    }>();
    const areaSessions = calendar.sessions.filter((s) => s.track === 'AREA');
    expect(areaSessions).toHaveLength(release.sessions.length);
    expect(calendar.sessions.filter((s) => s.track === 'SPORT')).toHaveLength(
      training.sessions.length,
    );
    expect(
      areaSessions.every((s) => s.areaName?.startsWith('Preparazione')),
    ).toBe(true);
  });

  it('chiude una seduta di area senza toccare il ciclo sportivo', async () => {
    const athlete = await f.user();
    const training = await publishTrainingWindow(athlete.id);
    await runScheduled(athlete.id);
    const session = await f.prisma.areaSession.findFirstOrThrow({
      where: { userId: athlete.id, status: 'SCHEDULED' },
      orderBy: { scheduledDate: 'asc' },
    });

    const response = await f.app.inject({
      method: 'POST',
      url: `/api/athlete/training/sessions/${session.id}/complete`,
      headers: athlete.headers,
      payload: { completionRating: 4, completionNotes: 'Bene' },
    });
    expect(response.statusCode).toBe(200);
    expect(
      await f.prisma.areaSession.findUniqueOrThrow({
        where: { id: session.id },
      }),
    ).toMatchObject({ status: 'COMPLETED', completionRating: 4 });
    expect(
      await f.prisma.planItem.findUniqueOrThrow({
        where: { id: session.planItemId },
      }),
    ).toMatchObject({ status: 'COMPLETED', completionRating: 4 });
    // Il ciclo sportivo resta aperto: le sue sessioni non sono state toccate.
    expect(
      await f.prisma.trainingPlanRelease.findUniqueOrThrow({
        where: { id: training.id },
        select: { status: true },
      }),
    ).toMatchObject({ status: 'ACTIVE' });
    expect(
      await f.prisma.trainingSession.count({
        where: { userId: athlete.id, status: 'SCHEDULED' },
      }),
    ).toBe(training.sessions.length);
  });

  it('non genera due volte la stessa finestra con worker concorrenti', async () => {
    const athlete = await f.user();
    await publishTrainingWindow(athlete.id);
    const [operation] = await f.prisma.abilityPlanOperation.findMany({
      where: { userId: athlete.id, areaId: scheduledAreaId },
    });
    await Promise.all([
      worker.resume(operation.id),
      worker.resume(operation.id),
    ]);
    expect(
      await f.prisma.improvementPlanRelease.count({
        where: { userId: athlete.id, areaId: scheduledAreaId },
      }),
    ).toBe(1);
    const release = await f.prisma.improvementPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id, areaId: scheduledAreaId },
      include: { items: true, sessions: true },
    });
    expect(release.sessions).toHaveLength(release.items.length);
  });

  it('affianca sedute brevi alle sessioni sportive quando i giorni disponibili sono gia tutti allenati', async () => {
    const athlete = await f.user();
    // Disponibilita pari alle sessioni sportive: nessun giorno libero per l area.
    await f.prisma.userOnboardingAssessment.update({
      where: { userId: athlete.id },
      data: {
        profileJson: {
          summary: 'Profilo reale test',
          general_training_frequency: { value: '6_PLUS' },
          training_days_available: { value: 1 },
          training_session_duration: { value: 60 },
          program_duration_weeks: { value: 12 },
        },
      },
    });
    const training = await publishTrainingWindow(athlete.id);
    const [operation] = await runScheduled(athlete.id);
    const after = await f.prisma.abilityPlanOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(after.completedAt).not.toBeNull();
    expect(after.lastErrorCode).toBeNull();
    const release = await f.prisma.improvementPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id, areaId: scheduledAreaId },
      include: { sessions: { include: { planItem: true } } },
    });
    expect(release.status).toBe('ACTIVE');
    expect(release.sessions.length).toBeGreaterThan(0);
    const sportDays = training.sessions.map((s) =>
      s.scheduledDate.toISOString().slice(0, 10),
    );
    for (const session of release.sessions) {
      expect(sportDays).toContain(
        session.scheduledDate.toISOString().slice(0, 10),
      );
      expect(
        (session.planItem.metadata as { durationMinutes: number })
          .durationMinutes,
      ).toBeLessThanOrEqual(20);
    }
  });

  it('sostituisce l elenco nato prima del passaggio a calendario con la prima finestra', async () => {
    const athlete = await f.user();
    // L area era ancora un elenco quando l atleta ha chiesto i piani.
    await f.prisma.sportSpecializationAreaPrompt.updateMany({
      where: { areaId: scheduledAreaId },
      data: { isScheduled: false },
    });
    try {
      await plans.request(athlete.id);
      const legacy = await f.prisma.abilityPlanOperation.findFirstOrThrow({
        where: { userId: athlete.id, areaId: scheduledAreaId },
      });
      await worker.resume(legacy.id);
    } finally {
      await f.prisma.sportSpecializationAreaPrompt.updateMany({
        where: { areaId: scheduledAreaId },
        data: { isScheduled: true },
      });
    }
    expect(
      await f.prisma.improvementPlanRelease.findFirstOrThrow({
        where: { userId: athlete.id, areaId: scheduledAreaId },
      }),
    ).toMatchObject({ status: 'ACTIVE', startsOn: null });

    // Le attivita dell elenco non sono completate: la finestra parte comunque.
    const training = await publishTrainingWindow(athlete.id);
    await runScheduled(athlete.id);
    const releases = await f.prisma.improvementPlanRelease.findMany({
      where: { userId: athlete.id, areaId: scheduledAreaId },
      include: { sessions: true },
      orderBy: { version: 'asc' },
    });
    expect(releases.map((r) => r.status)).toEqual(['ARCHIVED', 'ACTIVE']);
    expect(releases[1].trainingReleaseId).toBe(training.id);
    expect(releases[1].sessions.length).toBeGreaterThan(0);
  });
});
