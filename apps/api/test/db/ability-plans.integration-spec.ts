import { approvePlanItem } from '../../src/professional/professional-cycle-review';
import { AbacService } from '../../src/common/policies/abac.service';
import { OrchestratorService } from '../../src/ai-orchestrator/orchestrator.service';
import { randomUUID } from 'node:crypto';
import { lifecycleFixture } from './lifecycle-test-helper';
import { AbilityPlansService } from '../../src/ability-plans/ability-plans.service';
import { AbilityPlansWorker } from '../../src/ability-plans/ability-plans.worker';
import { TrainingLifecycleOrchestrator } from '../../src/training-lifecycle/training-lifecycle.orchestrator';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import * as publication from '../../src/ai-orchestrator/cycle-publication';

describe('All ability plans with PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  let plans: AbilityPlansService, worker: AbilityPlansWorker;
  const areaIds: string[] = [];
  let professionalId: string;
  beforeAll(async () => {
    f = await lifecycleFixture();
    plans = f.app.get(AbilityPlansService);
    worker = f.app.get(AbilityPlansWorker);
    professionalId = (await f.user('PROFESSIONAL')).id;
    for (let i = 0; i < 7; i++) {
      const area = await f.prisma.area.create({
        data: {
          name: `Ability ${i}-${randomUUID()}`,
          sportSpecializationPrompts: {
            create: {
              specializationId: f.specializationId,
              basePrompt: 'Proponi esercizi specifici per questa abilità',
              isEnabledDriver: i < 6,
            },
          },
          professionalAreaCompetences: { create: { professionalId } },
        },
      });
      areaIds.push(area.id);
    }
  }, 60000);
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ABILITY_APPROVAL_MODE;
  });
  afterAll(async () => {
    if (!f) return;
    const area = { areaId: { in: areaIds } };
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
    await f.prisma.area.deleteMany({ where: { id: { in: areaIds } } });
    await f.cleanup();
  });
  async function queued(userId: string) {
    return f.prisma.abilityPlanOperation.findMany({
      where: { userId },
      orderBy: { areaId: 'asc' },
    });
  }
  it('queues all six enabled areas from the same program request, then publishes once under concurrent workers', async () => {
    const user = await f.user();
    const training = f.app.get(TrainingLifecycleOrchestrator);
    await Promise.all([
      training.requestPlan(user.id),
      training.requestPlan(user.id),
      plans.request(user.id),
    ]);
    const ops = await queued(user.id);
    expect(ops).toHaveLength(6);
    expect(ops.map((o) => o.areaId)).not.toContain(areaIds[6]);
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateCycleProposal',
    );
    await Promise.all(
      ops.flatMap((o) => [worker.resume(o.id), worker.resume(o.id)]),
    );
    expect(generate).toHaveBeenCalledTimes(6);
    const response = await f.app.inject({
      method: 'GET',
      url: '/api/athlete/abilities',
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    const state = response.json<{
      abilities: {
        status: string;
        plan: { items: unknown[]; checkInId: string };
      }[];
    }>();
    expect(state.abilities).toHaveLength(6);
    for (const ability of state.abilities) {
      expect(ability.status).toBe('READY');
      expect(ability.plan.items.length).toBeGreaterThan(0);
      expect(ability.plan.checkInId).toBeTruthy();
    }
    const releases = await f.prisma.improvementPlanRelease.findMany({
      where: { userId: user.id },
    });
    expect(
      releases.every(
        (r) =>
          r.approvalSource === 'SYSTEM' &&
          r.publishedByAdminId === null &&
          r.proposedByAdminId === null,
      ),
    ).toBe(true);
    await plans.request(user.id);
    await Promise.all(ops.map((o) => worker.resume(o.id)));
    expect(generate).toHaveBeenCalledTimes(6);
    expect(
      await f.prisma.professionalUserLink.count({ where: { userId: user.id } }),
    ).toBe(6);
    expect(
      await f.prisma.trainingSession.count({ where: { userId: user.id } }),
    ).toBe(0);
  });
  it('isolates a failed area and retries only that area after restart', async () => {
    const user = await f.user();
    await plans.request(user.id);
    const ops = await queued(user.id);
    const provider = f.app.get(AiProposalProviderService),
      original = provider.generateCycleProposal.bind(provider);
    const generate = jest
      .spyOn(provider, 'generateCycleProposal')
      .mockImplementation((input) =>
        input.area.id === ops[0].areaId
          ? Promise.reject(new Error('provider unavailable'))
          : original(input),
      );
    await Promise.all(ops.map((o) => worker.resume(o.id)));
    const state = await plans.current(user.id);
    expect(state.abilities.filter((a) => a.status === 'READY')).toHaveLength(5);
    expect(state.abilities.filter((a) => a.status === 'ERROR')).toHaveLength(1);
    generate.mockImplementation(original);
    await f.prisma.abilityPlanOperation.update({
      where: { id: ops[0].id },
      data: {
        nextAttemptAt: new Date(0),
        leaseToken: 'crashed',
        leaseUntil: new Date(0),
      },
    });
    await worker.drain();
    expect(
      (await plans.current(user.id)).abilities.every(
        (a) => a.status === 'READY',
      ),
    ).toBe(true);
    expect(generate).toHaveBeenCalledTimes(7);
  });
  it('resumes publication without regenerating the persisted proposal', async () => {
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateCycleProposal',
    );
    const publish = jest
      .spyOn(publication, 'publishCycle')
      .mockRejectedValueOnce(new Error('interrupted'));
    await worker.resume(op.id);
    expect(
      (
        await f.prisma.abilityPlanOperation.findUniqueOrThrow({
          where: { id: op.id },
        })
      ).releaseId,
    ).toBeTruthy();
    await worker.resume(op.id);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(
      (
        await f.prisma.abilityPlanOperation.findUniqueOrThrow({
          where: { id: op.id },
        })
      ).completedAt,
    ).not.toBeNull();
  });
  it('preserves MANUAL review and never auto-approves a pre-existing proposal', async () => {
    process.env.ABILITY_APPROVAL_MODE = 'MANUAL';
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    await worker.resume(op.id);
    const saved = await f.prisma.abilityPlanOperation.findUniqueOrThrow({
      where: { id: op.id },
    });
    expect(
      (
        await f.prisma.improvementPlanRelease.findUniqueOrThrow({
          where: { id: saved.releaseId! },
        })
      ).status,
    ).toBe('PENDING_APPROVAL');
    process.env.ABILITY_APPROVAL_MODE = 'AUTO';
    await plans.request(user.id);
    await worker.resume(op.id);
    expect(
      (await plans.current(user.id)).abilities.find((a) => a.id === op.areaId)
        ?.status,
    ).toBe('REVIEW');
    await expect(
      publication.publishCycle(f.prisma, saved.releaseId!, null, true),
    ).rejects.toThrow('Approvazione automatica non consentita');
    await f.prisma.planItem.updateMany({
      where: { planReleaseId: saved.releaseId! },
      data: { status: 'APPROVED', approvedByProfessionalId: professionalId },
    });
    await f.prisma.questionSetAreaApproval.updateMany({
      where: { questionSet: { planReleaseId: saved.releaseId! } },
      data: { status: 'APPROVED', approvedByProfessionalId: professionalId },
    });
    await publication.publishCycle(f.prisma, saved.releaseId!, professionalId);
    await worker.resume(op.id);
    expect(
      (await plans.current(user.id)).abilities.find((a) => a.id === op.areaId)
        ?.status,
    ).toBe('READY');
  });
  it('blocks missing specialists before AI, preserves other areas, and resumes when competence returns', async () => {
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    await f.prisma.professionalAreaCompetence.deleteMany({
      where: { areaId: op.areaId },
    });
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateCycleProposal',
    );
    try {
      await worker.resume(op.id);
      expect(generate).not.toHaveBeenCalled();
      expect(
        (await plans.current(user.id)).abilities.find((a) => a.id === op.areaId)
          ?.errorCode,
      ).toBe('PROFESSIONAL_UNAVAILABLE');
    } finally {
      await f.prisma.professionalAreaCompetence.create({
        data: { areaId: op.areaId, professionalId },
      });
    }
    await worker.resume(op.id);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('enforces authentication, role and completed onboarding; returns only the authenticated athlete plans', async () => {
    const user = await f.user(),
      incomplete = await f.user('USER', false),
      pro = await f.user('PROFESSIONAL');
    const url = '/api/athlete/abilities/request';
    expect((await f.app.inject({ method: 'POST', url })).statusCode).toBe(403);
    expect(
      (await f.app.inject({ method: 'POST', url, headers: pro.headers }))
        .statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ method: 'POST', url, headers: incomplete.headers }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: user.headers,
          payload: { userId: incomplete.id },
        })
      ).statusCode,
    ).toBe(202);
    expect(await queued(incomplete.id)).toHaveLength(0);
    expect(
      (await plans.current(incomplete.id)).abilities.every(
        (a) => a.plan === null,
      ),
    ).toBe(true);
  });
  it('fences a worker that loses its lease during AI generation', async () => {
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    const provider = f.app.get(AiProposalProviderService),
      original = provider.generateCycleProposal.bind(provider);
    const generate = jest
      .spyOn(provider, 'generateCycleProposal')
      .mockImplementationOnce(async (input) => {
        const proposal = await original(input);
        await f.prisma.abilityPlanOperation.update({
          where: { id: op.id },
          data: { leaseToken: 'new-worker', leaseUntil: new Date(0) },
        });
        return proposal;
      });
    await worker.resume(op.id);
    expect(
      await f.prisma.improvementPlanRelease.count({
        where: { userId: user.id },
      }),
    ).toBe(0);
    await worker.resume(op.id);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(
      await f.prisma.improvementPlanRelease.count({
        where: { userId: user.id },
      }),
    ).toBe(1);
  });
  it('rechecks consents before making an external proposal', async () => {
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    await f.prisma.consent.updateMany({
      where: { userId: user.id },
      data: { withdrawnAt: new Date() },
    });
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateCycleProposal',
    );
    await worker.resume(op.id);
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await plans.current(user.id)).abilities.find((a) => a.id === op.areaId)
        ?.errorCode,
    ).toBe('REQUIRED_CONSENTS_MISSING');
  });
  it('does not let a stale professional review overwrite a published item', async () => {
    process.env.ABILITY_APPROVAL_MODE = 'MANUAL';
    const user = await f.user();
    await plans.request(user.id);
    const [op] = await queued(user.id);
    await worker.resume(op.id);
    const saved = await f.prisma.abilityPlanOperation.findUniqueOrThrow({
      where: { id: op.id },
    });
    const item = await f.prisma.planItem.findFirstOrThrow({
      where: { planReleaseId: saved.releaseId! },
    });
    const abac = new AbacService(f.prisma);
    jest.spyOn(abac, 'canAccessUserArea').mockImplementationOnce(async () => {
      await f.prisma.planItem.updateMany({
        where: { planReleaseId: saved.releaseId! },
        data: { status: 'APPROVED', approvedByProfessionalId: professionalId },
      });
      await f.prisma.questionSetAreaApproval.updateMany({
        where: { questionSet: { planReleaseId: saved.releaseId! } },
        data: { status: 'APPROVED', approvedByProfessionalId: professionalId },
      });
      await Promise.all([
        publication.publishCycle(f.prisma, saved.releaseId!, professionalId),
        publication.publishCycle(f.prisma, saved.releaseId!, professionalId),
      ]);
      return true;
    });
    await expect(
      approvePlanItem(
        f.prisma,
        abac,
        f.app.get(OrchestratorService),
        { id: professionalId, role: 'PROFESSIONAL' },
        item.id,
      ),
    ).rejects.toThrow('Approvazione già decisa');
    expect(
      (await f.prisma.planItem.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('ACTIVE');
    expect(
      await f.prisma.cycleAuditLog.count({
        where: { planReleaseId: saved.releaseId!, action: 'PUBLISH' },
      }),
    ).toBe(1);
  });
  it('does not fall back to all repository areas when sport drivers are disabled', async () => {
    const user = await f.user();
    await f.prisma.sportSpecializationAreaPrompt.updateMany({
      where: { specializationId: f.specializationId },
      data: { isActive: false },
    });
    try {
      await expect(plans.request(user.id)).rejects.toThrow(
        'Le abilità del tuo sport',
      );
      expect(await queued(user.id)).toHaveLength(0);
    } finally {
      await f.prisma.sportSpecializationAreaPrompt.updateMany({
        where: { specializationId: f.specializationId },
        data: { isActive: true },
      });
    }
  });
});
