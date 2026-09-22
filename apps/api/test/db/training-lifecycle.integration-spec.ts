import { approveTrainingPlanItem } from '../../src/professional/professional-training-review';
import { AbacService } from '../../src/common/policies/abac.service';
import { OrchestratorService } from '../../src/ai-orchestrator/orchestrator.service';
import { BadRequestException } from '@nestjs/common';
import { lifecycleFixture } from './lifecycle-test-helper';
import { TrainingLifecycleOrchestrator } from '../../src/training-lifecycle/training-lifecycle.orchestrator';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { TrainingPublicationService } from '../../src/training-publication/training-publication.service';
import { CoachAssignmentService } from '../../src/coach-assignment/coach-assignment.service';
import { CycleCompletionService } from '../../src/cycle-completion/cycle-completion.service';

describe('Automated training lifecycle: real PostgreSQL, HTTP and provider adapter', () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  let lifecycle: TrainingLifecycleOrchestrator;
  let provider: AiProposalProviderService;
  let generate: jest.SpyInstance<
    ReturnType<AiProposalProviderService['generateCycleProposal']>,
    Parameters<AiProposalProviderService['generateCycleProposal']>
  >;
  const env = { ...process.env };
  beforeAll(async () => {
    f = await lifecycleFixture();
    lifecycle = f.app.get(TrainingLifecycleOrchestrator);
    provider = f.app.get(AiProposalProviderService);
    generate = jest.spyOn(provider, 'generateCycleProposal');
  }, 60000);
  afterAll(async () => {
    await f?.cleanup();
    process.env = env;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    generate = jest.spyOn(provider, 'generateCycleProposal');
    process.env.TRAINING_APPROVAL_MODE = 'AUTO';
  });
  async function request(user: Awaited<ReturnType<typeof f.user>>) {
    const response = await f.app.inject({
      method: 'POST',
      url: '/api/training/lifecycle/request',
      headers: user.headers,
    });
    expect(response.statusCode).toBe(202);
    return f.prisma.trainingLifecycleOperation.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }
  it('rejects incomplete onboarding and unauthenticated requests without creating work', async () => {
    const athlete = await f.user('USER', false);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/training/lifecycle/request',
          headers: athlete.headers,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/training/lifecycle/request',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      await f.prisma.trainingLifecycleOperation.count({
        where: { userId: athlete.id },
      }),
    ).toBe(0);
  });
  it('recovers a missing coach without a partial release or another athlete request', async () => {
    const athlete = await f.user();
    const operation = await request(athlete);
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'ERROR',
      errorCode: 'COACH_ASSIGNMENT_UNAVAILABLE',
      retryScheduled: true,
    });
    expect(
      await f.prisma.trainingPlanRelease.count({
        where: { userId: athlete.id },
      }),
    ).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    await f.coach();
    await f.prisma.trainingLifecycleOperation.update({
      where: { id: operation.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await lifecycle.drain();
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('runs request → assignment → AUTO publication → feedback/check-in → second AI cycle exactly once under retries', async () => {
    generate.mockRestore();
    const realGenerate = provider.generateCycleProposal.bind(provider);
    generate = jest
      .spyOn(provider, 'generateCycleProposal')
      .mockImplementation(async (input) => {
        const proposal = await realGenerate(input);
        return {
          ...proposal,
          planItems: [
            ...proposal.planItems,
            { ...proposal.planItems[0], title: 'Seconda sessione' },
          ],
        };
      });
    const athlete = await f.user();
    const freeCoach = await f.coach();
    await Promise.all([request(athlete), request(athlete)]);
    const operations = await f.prisma.trainingLifecycleOperation.findMany({
      where: { userId: athlete.id },
    });
    expect(operations).toHaveLength(1);
    await Promise.all([
      lifecycle.resumeLifecycle(operations[0].id),
      lifecycle.resumeLifecycle(operations[0].id),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    const link = await f.prisma.coachUserLink.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    expect(link.coachId).toBe(freeCoach.id);
    const first = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
      include: {
        items: true,
        sessions: { orderBy: { sequence: 'asc' } },
        questionSets: {
          include: {
            questions: { include: { options: true } },
            approvals: true,
          },
        },
      },
    });
    expect(first).toMatchObject({
      status: 'ACTIVE',
      cycleStatus: 'PUBLISHED',
      approvalMode: 'AUTO',
      approvalSource: 'SYSTEM',
      sessionApprovalMode: 'INHERIT_PLAN',
    });
    expect(first.sessions.length).toBe(first.items.length);
    expect(first.sessions.length).toBeGreaterThan(0);
    expect(
      first.items.every(
        (i) => i.approvalSource === 'SYSTEM' && i.approvedByCoachId === null,
      ),
    ).toBe(true);
    expect(first.questionSets[0].approvals[0]).toMatchObject({
      approvalSource: 'SYSTEM',
      approvedByCoachId: null,
    });
    const publication = f.app.get(TrainingPublicationService);
    await Promise.all([
      publication.publishIfReady(first.id),
      publication.publishIfReady(first.id),
      request(athlete),
    ]);
    expect(
      await f.prisma.trainingSession.count({
        where: { trainingPlanReleaseId: first.id },
      }),
    ).toBe(first.items.length);
    const stranger = await f.user();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/athlete/training/sessions/${first.sessions[0].id}/complete`,
          headers: stranger.headers,
        })
      ).statusCode,
    ).toBe(404);
    for (const [index, session] of first.sessions.entries()) {
      const args = {
        method: 'POST' as const,
        url: `/api/athlete/training/sessions/${session.id}/${index === 0 ? 'skip' : 'complete'}`,
        headers: athlete.headers,
        payload: {
          completionNotes: 'Resistenza migliorata',
          completionRating: 4,
        },
      };
      const responses = await Promise.all([
        f.app.inject(args),
        f.app.inject(args),
      ]);
      expect(responses.some((r) => r.statusCode === 200)).toBe(true);
    }
    expect(
      (
        await f.prisma.trainingPlanRelease.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).cycleStatus,
    ).toBe('PUBLISHED');
    expect(
      await f.prisma.trainingLifecycleOperation.count({
        where: { previousReleaseId: first.id },
      }),
    ).toBe(0);
    const qs = first.questionSets[0];
    const payload = {
      questionSetId: qs.id,
      answers: qs.questions.map((q) => ({
        questionId: q.id,
        answerOptionId: q.options[0].id,
      })),
    };
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/answers/training/batch',
          headers: athlete.headers,
          payload,
        })
      ).statusCode,
    ).toBe(201);
    await Promise.all([
      f.app.get(CycleCompletionService).evaluate(first.id),
      f.app.get(CycleCompletionService).evaluate(first.id),
      lifecycle.continueAfterCycle(athlete.id, first.id),
    ]);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'PREPARING',
      preparingNext: true,
    });
    const nextOps = await f.prisma.trainingLifecycleOperation.findMany({
      where: { previousReleaseId: first.id },
    });
    expect(nextOps).toHaveLength(1);
    await Promise.all([
      lifecycle.resumeLifecycle(nextOps[0].id),
      lifecycle.resumeLifecycle(nextOps[0].id),
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
    const second = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { previousReleaseId: first.id },
      include: { sessions: true },
    });
    expect(second).toMatchObject({ cycleStatus: 'PUBLISHED', version: 2 });
    expect(second.sessions).toHaveLength(first.items.length);
    expect(
      (
        await f.prisma.coachUserLink.findFirstOrThrow({
          where: { userId: athlete.id },
        })
      ).id,
    ).toBe(link.id);
    const input = generate.mock.calls[1][0];
    const previous = input.context.training!.previousCycle!;
    expect(previous.id).toBe(first.id);
    expect(previous.cycleStatus).toBe('CLOSED');
    expect(previous.sessions.map((s) => s.status)).toEqual([
      'SKIPPED',
      'COMPLETED',
    ]);
    expect(previous.sessions[1]).toMatchObject({
      completionRating: 4,
      completionNotes: 'Resistenza migliorata',
    });
    expect(previous.questionSets[0].status).toBe('CLOSED');
    expect(
      previous.questionSets[0].questions[0].answers[0].answerOption?.label,
    ).toBe(qs.questions[0].options[0].label);
    expect(
      (await lifecycle.coachPlans(freeCoach)).some((p) => p.id === second.id),
    ).toBe(true);
    const actions = (
      await f.prisma.cycleAuditLog.findMany({ where: { userId: athlete.id } })
    ).map((a) => a.action);
    for (const action of [
      'PLAN_REQUESTED',
      'COACH_ASSIGNED',
      'AI_GENERATION_STARTED',
      'AI_GENERATION_COMPLETED',
      'AUTO_APPROVED',
      'PLAN_PUBLISHED',
      'SESSION_COMPLETED',
      'CYCLE_CLOSED',
      'NEXT_CYCLE_STARTED',
    ])
      expect(actions).toContain(action);
    expect(actions.filter((a) => a === 'CYCLE_CLOSED')).toHaveLength(1);
    expect(actions.filter((a) => a === 'PLAN_PUBLISHED')).toHaveLength(2);
    await expect(
      f.prisma.trainingPlanRelease.create({
        data: {
          userId: athlete.id,
          specializationId: f.specializationId,
          version: 999,
          lifecycleManaged: true,
          summaryText: 'duplicate',
          outputJson: {},
          provider: 'test',
          model: 'test',
          promptVersion: '1',
          promptHash: 'x',
        },
      }),
    ).rejects.toThrow();
  });
  it('waits for the assigned coach in MANUAL and publishes through the same adapter', async () => {
    process.env.TRAINING_APPROVAL_MODE = 'MANUAL';
    const athlete = await f.user();
    const operation = await request(athlete);
    await lifecycle.resumeLifecycle(operation.id);
    const plan = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    expect(plan.cycleStatus).toBe('WAITING_APPROVALS');
    expect(
      await f.prisma.trainingSession.count({ where: { userId: athlete.id } }),
    ).toBe(0);
    const link = await f.prisma.coachUserLink.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    const outsider = await f.coach();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/training/lifecycle/releases/${plan.id}/approve`,
          headers: outsider.headers,
        })
      ).statusCode,
    ).toBe(403);
    await lifecycle.approveManual(plan.id, {
      id: link.coachId,
      role: 'PROFESSIONAL',
    });
    await lifecycle.resumeLifecycle(operation.id);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
    });
    expect(
      await f.prisma.trainingPlanRelease.findUniqueOrThrow({
        where: { id: plan.id },
      }),
    ).toMatchObject({
      approvalSource: 'PROFESSIONAL',
      cycleStatus: 'PUBLISHED',
    });
    expect(
      await f.prisma.cycleAuditLog.count({
        where: { trainingPlanReleaseId: plan.id, action: 'MANUAL_APPROVED' },
      }),
    ).toBe(1);
  });
  it('retries provider and invalid-output errors, preserving the assigned coach', async () => {
    const athlete = await f.user();
    const operation = await request(athlete);
    generate.mockRejectedValueOnce(new Error('provider unavailable'));
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      errorCode: 'AI_GENERATION_FAILED',
      retryScheduled: true,
    });
    const link = await f.prisma.coachUserLink.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    generate.mockRejectedValueOnce(
      new BadRequestException('Output schema non valido'),
    );
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      errorCode: 'INVALID_AI_OUTPUT',
    });
    expect(
      await f.prisma.trainingPlanRelease.count({
        where: { userId: athlete.id },
      }),
    ).toBe(0);
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
    });
    expect(
      (
        await f.prisma.coachUserLink.findFirstOrThrow({
          where: { userId: athlete.id },
        })
      ).id,
    ).toBe(link.id);
  });
  it('retries publication without invoking AI again, including an expired worker lease', async () => {
    const athlete = await f.user();
    const operation = await request(athlete);
    jest
      .spyOn(f.app.get(TrainingPublicationService), 'publishIfReady')
      .mockRejectedValueOnce(new Error('temporary publication failure'));
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'ERROR',
      errorCode: 'PUBLICATION_FAILED',
    });
    const plan = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    expect(plan.cycleStatus).toBe('READY_TO_PUBLISH');
    await f.prisma.trainingLifecycleOperation.update({
      where: { id: operation.id },
      data: {
        leaseToken: 'crashed-worker',
        leaseUntil: new Date(0),
        nextAttemptAt: new Date(0),
      },
    });
    await lifecycle.drain();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
      errorCode: null,
    });
  });
  it('keeps valid assignments under concurrent requests and refuses implicit replacement', async () => {
    const athlete = await f.user();
    const assignment = f.app.get(CoachAssignmentService);
    const [a, b] = await Promise.all([
      assignment.ensureAssigned(athlete.id),
      assignment.ensureAssigned(athlete.id),
    ]);
    expect(a.id).toBe(b.id);
    await f.prisma.user.update({
      where: { id: a.coachId },
      data: { isActive: false },
    });
    try {
      await expect(assignment.ensureAssigned(athlete.id)).rejects.toThrow(
        'COACH_ASSIGNMENT_INVALID',
      );
    } finally {
      await f.prisma.user.update({
        where: { id: a.coachId },
        data: { isActive: true },
      });
    }
  });
  it('honors automation and assignment switches without losing queued work', async () => {
    const athlete = await f.user();
    process.env.TRAINING_LIFECYCLE_AUTOMATION = 'false';
    try {
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/training/lifecycle/request',
            headers: athlete.headers,
          })
        ).statusCode,
      ).toBe(503);
      expect(
        await f.prisma.trainingLifecycleOperation.count({
          where: { userId: athlete.id },
        }),
      ).toBe(0);
    } finally {
      delete process.env.TRAINING_LIFECYCLE_AUTOMATION;
    }
    const operation = await request(athlete);
    process.env.COACH_AUTO_ASSIGNMENT = 'false';
    try {
      await lifecycle.resumeLifecycle(operation.id);
      expect(await lifecycle.current(athlete.id)).toMatchObject({
        errorCode: 'COACH_ASSIGNMENT_UNAVAILABLE',
      });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      delete process.env.COACH_AUTO_ASSIGNMENT;
    }
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
    });
  });
  it('orders equally loaded coaches by creation date and then ID', async () => {
    const a = await f.coach();
    const b = await f.coach();
    const ids = [a.id, b.id].sort();
    const time = new Date('2020-01-01');
    await f.prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: time },
    });
    const athlete = await f.user();
    expect(
      (await f.app.get(CoachAssignmentService).ensureAssigned(athlete.id))
        .coachId,
    ).toBe(ids[0]);
  });
  it('does not let a stale individual coach review overwrite a published session', async () => {
    process.env.TRAINING_APPROVAL_MODE = 'MANUAL';
    const athlete = await f.user();
    const operation = await request(athlete);
    await lifecycle.resumeLifecycle(operation.id);
    const plan = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
      include: { items: true },
    });
    const link = await f.prisma.coachUserLink.findFirstOrThrow({
      where: { userId: athlete.id },
    });
    let releaseReview!: (allowed: boolean) => void;
    let entered!: () => void;
    const reachedAuthorization = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const allowed = new Promise<boolean>((resolve) => {
      releaseReview = resolve;
    });
    const abac = {
      canCoachAccessUserSpecialization: () => {
        entered();
        return allowed;
      },
    } as unknown as AbacService;
    const actor = { id: link.coachId, role: 'PROFESSIONAL' as const };
    const staleReview = approveTrainingPlanItem(
      f.prisma,
      abac,
      f.app.get(OrchestratorService),
      actor,
      plan.items[0].id,
    );
    await reachedAuthorization;
    await lifecycle.approveManual(plan.id, actor);
    const assertion = expect(staleReview).rejects.toThrow(
      'Approvazione già decisa',
    );
    releaseReview(true);
    await assertion;
    expect(
      await f.prisma.trainingPlanItem.findUniqueOrThrow({
        where: { id: plan.items[0].id },
      }),
    ).toMatchObject({ status: 'ACTIVE' });
  });
});
