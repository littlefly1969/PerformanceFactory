import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrchestratorService } from '../src/ai-orchestrator/orchestrator.service';
import { UserRole } from '@prisma/client';
import { createPrismaTestFake } from './utils/prisma-test-fake';

type PlanReleaseRecord = {
  id: string;
  userId: string;
  areaId: string;
  version: number;
  status: string;
  cycleStatus?: string;
  createdAt: Date;
  publishedAt?: Date;
  archivedAt?: Date;
  activityStatus?: string;
};

const makePrismaMock = () => {
  const users = [{ id: 'user-1', role: UserRole.USER, isActive: true }];
  const areas = [
    { id: 'area-1', name: 'Footwork' },
    { id: 'area-2', name: 'Mindset' },
  ];
  const snapshots: Array<{
    id: string;
    userId: string;
    rankingGlobal: number;
    reason: string;
    createdAt: Date;
    areas: Array<{ areaId: string; realR: number; potentialP: number }>;
  }> = [];
  const planReleases: PlanReleaseRecord[] = [];
  const questionSets: Array<{
    id: string;
    userId: string;
    planReleaseId: string;
    areaId: string;
    status: string;
    approvals: Array<{ status: string }>;
  }> = [];
  const aiSummaries: Array<{
    id: string;
    userId: string;
    cycleStatus?: string;
    planReleaseId?: string;
  }> = [];
  const aiProposalAudits: Array<{
    id: string;
    userId: string;
    provider: string;
    model: string;
  }> = [];
  const auditLogs: Array<{ id: string; userId: string; action: string }> = [];

  const nextId = (prefix: string, list: Array<{ id: string }>) =>
    `${prefix}-${list.length + 1}`;

  const prismaMock = createPrismaTestFake({
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        users.find((user) => user.id === where.id) ?? null,
    },
    area: {
      findMany: () => areas,
      findUnique: ({ where }: { where: { id: string } }) =>
        areas.find((area) => area.id === where.id) ?? null,
    },
    professionalUserLink: {
      findMany: () => [
        { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-1' },
        { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-2' },
      ],
      findFirst: ({ where }: { where: { userId?: string; areaId?: string } }) =>
        [
          { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-1' },
          { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-2' },
        ].find(
          (link) =>
            (!where.userId || link.userId === where.userId) &&
            (!where.areaId || link.areaId === where.areaId),
        ) ?? null,
    },
    professionalAreaCompetence: {
      findMany: () => [
        { professionalId: 'pro-1', areaId: 'area-1', createdAt: new Date() },
        { professionalId: 'pro-1', areaId: 'area-2', createdAt: new Date() },
      ],
      findFirst: ({
        where,
      }: {
        where: { professionalId?: { in: string[] }; areaId?: string };
      }) => {
        const professionalId = where.professionalId?.in?.[0];
        if (!professionalId || !where.areaId) {
          return null;
        }
        const entry = [
          { professionalId: 'pro-1', areaId: 'area-1' },
          { professionalId: 'pro-1', areaId: 'area-2' },
        ].find(
          (item) =>
            item.professionalId === professionalId &&
            item.areaId === where.areaId,
        );
        return entry ?? null;
      },
    },
    userSportSelection: {
      findUnique: () => null,
    },
    sportSpecializationAreaPrompt: {
      findMany: () => [],
      findUnique: () => null,
    },
    aiAreaGenerationConfig: {
      findUnique: () => null,
    },
    userOnboardingAssessment: {
      findUnique: () => null,
    },
    currentState: {
      findUnique: () => null,
    },
    userAreaPromptInstruction: {
      findUnique: () => null,
    },
    consent: {
      findFirst: () => ({ id: 'consent-1' }),
    },
    performanceProfileSnapshot: {
      findMany: () =>
        snapshots
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      findFirst: () =>
        snapshots
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
        null,
      create: ({
        data,
      }: {
        data: {
          userId: string;
          rankingGlobal: number;
          reason: string;
          areas: {
            create: Array<{
              areaId: string;
              realR: number;
              potentialP: number;
            }>;
          };
        };
      }) => {
        const entry = {
          id: nextId('snapshot', snapshots),
          userId: data.userId,
          rankingGlobal: data.rankingGlobal,
          reason: data.reason,
          createdAt: new Date(),
          areas: data.areas.create,
        };
        snapshots.push(entry);
        return { id: entry.id, createdAt: entry.createdAt };
      },
    },
    questionSet: {
      findFirst: () => null,
      create: ({
        data,
      }: {
        data: {
          userId: string;
          planReleaseId: string;
          areaId: string;
          status: string;
          approvals?: {
            create: Array<{
              areaId: string;
              professionalId: string;
              status: string;
            }>;
          };
        };
      }) => {
        const entry = {
          id: nextId('qs', questionSets),
          userId: data.userId,
          planReleaseId: data.planReleaseId,
          areaId: data.areaId,
          status: data.status,
          approvals: (data.approvals?.create ?? []).map((item) => ({
            status: item.status,
          })),
        };
        questionSets.push(entry);
        return { id: entry.id };
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; publishedAt?: Date };
      }) => {
        const qs = questionSets.find((item) => item.id === where.id);
        if (!qs) {
          return null;
        }
        qs.status = data.status;
        return { id: qs.id };
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { planReleaseId: string; status?: string };
        data: { status: string };
      }) => {
        let count = 0;
        for (const qs of questionSets) {
          if (
            qs.planReleaseId === where.planReleaseId &&
            (!where.status || qs.status === where.status)
          ) {
            qs.status = data.status;
            count += 1;
          }
        }
        return { count };
      },
    },
    improvementPlanRelease: {
      findMany: ({
        where,
        take,
      }: {
        where?: { userId?: string; areaId?: string };
        take?: number;
      }) =>
        planReleases
          .filter((plan) => {
            if (where?.userId && plan.userId !== where.userId) {
              return false;
            }
            if (where?.areaId && plan.areaId !== where.areaId) {
              return false;
            }
            return true;
          })
          .sort((a, b) => b.version - a.version)
          .slice(0, take ?? undefined)
          .map((plan) => ({
            id: plan.id,
            version: plan.version,
            status: plan.status,
            cycleStatus: plan.cycleStatus ?? 'WAITING_APPROVALS',
            createdAt: plan.createdAt,
            publishedAt: plan.publishedAt ?? null,
            archivedAt: plan.archivedAt ?? null,
            items: [
              {
                title: 'Generated work',
                body: 'Generated work body',
                status: plan.activityStatus ?? 'ACTIVE',
                completedAt:
                  plan.activityStatus === 'COMPLETED' ? new Date() : null,
                completionRating: null,
                completionNotes: null,
                rejectionReason:
                  plan.status === 'REJECTED' ? 'Needs clearer wording' : null,
              },
            ],
            questionSets: questionSets
              .filter((set) => set.planReleaseId === plan.id)
              .map((set) => ({
                status: set.status,
                createdAt: new Date(),
                publishedAt: null,
                closedAt: set.status === 'CLOSED' ? new Date() : null,
                approvals: set.approvals.map((approval) => ({
                  status: approval.status,
                  rejectionReason:
                    approval.status === 'REJECTED'
                      ? 'Needs clearer wording'
                      : null,
                })),
                questions: [],
              })),
          })),
      findFirst: ({
        where,
      }: {
        where?: { userId?: string; areaId?: string; status?: string };
      }) => {
        const filtered = planReleases.filter((plan) => {
          if (where?.userId && plan.userId !== where.userId) {
            return false;
          }
          if (where?.areaId && plan.areaId !== where.areaId) {
            return false;
          }
          if (where?.status && plan.status !== where.status) {
            return false;
          }
          return true;
        });
        return (() => {
          const plan =
            filtered.slice().sort((a, b) => b.version - a.version)[0] ?? null;
          if (!plan) {
            return null;
          }
          const qs = questionSets.find(
            (item) => item.planReleaseId === plan.id,
          );
          return {
            ...plan,
            items: [{ status: plan.activityStatus ?? 'ACTIVE' }],
            questionSets: qs
              ? [{ status: qs.status, closedAt: undefined }]
              : [],
          };
        })();
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { userId: string; areaId?: string; status: string };
        data: { status: string; archivedAt?: Date };
      }) => {
        let count = 0;
        for (const plan of planReleases) {
          if (
            plan.userId === where.userId &&
            plan.status === where.status &&
            (where.areaId ? plan.areaId === where.areaId : true)
          ) {
            plan.status = data.status;
            plan.archivedAt = data.archivedAt;
            count += 1;
          }
        }
        return { count };
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string; cycleStatus?: string; publishedAt?: Date };
      }) => {
        const plan = planReleases.find((item) => item.id === where.id);
        if (!plan) {
          return null;
        }
        plan.status = data.status;
        plan.publishedAt = data.publishedAt;
        return { id: plan.id };
      },
      create: ({
        data,
      }: {
        data: {
          userId: string;
          areaId: string;
          version: number;
          status: string;
          cycleStatus?: string;
        };
      }) => {
        const entry: PlanReleaseRecord = {
          id: nextId('plan', planReleases),
          userId: data.userId,
          areaId: data.areaId,
          version: data.version,
          status: data.status,
          createdAt: new Date(),
          cycleStatus: data.cycleStatus,
        };
        planReleases.push(entry);
        return { id: entry.id, version: entry.version };
      },
      findUnique: ({ where }: { where: { id: string } }) => {
        const plan = planReleases.find((item) => item.id === where.id);
        if (!plan) {
          return null;
        }
        const qs = questionSets.find((item) => item.planReleaseId === plan.id);
        return {
          id: plan.id,
          userId: plan.userId,
          areaId: plan.areaId,
          status: plan.status,
          items: [{ id: 'item-1', status: 'APPROVED' }],
          questionSets: qs
            ? [{ id: qs.id, status: qs.status, approvals: qs.approvals }]
            : [],
        };
      },
      // I cicli di quest'area non sono a calendario: nessuna finestra, nessuna seduta datata.
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const plan = planReleases.find((item) => item.id === where.id);
        if (!plan) {
          throw new Error(`Plan release ${where.id} not found`);
        }
        return {
          userId: plan.userId,
          areaId: plan.areaId,
          startsOn: null,
          windowDays: null,
          items: [],
        };
      },
    },
    planItem: {
      updateMany: () => ({ count: 1 }),
    },
    questionSetAreaApproval: {
      updateMany: () => ({ count: 1 }),
    },
    aiContextSummary: {
      create: ({
        data,
      }: {
        data: { userId: string; cycleStatus?: string; planReleaseId?: string };
      }) => {
        const entry = {
          id: nextId('summary', aiSummaries),
          userId: data.userId,
          cycleStatus: data.cycleStatus,
          planReleaseId: data.planReleaseId,
        };
        aiSummaries.push(entry);
        return entry;
      },
      updateMany: () => ({ count: 1 }),
    },
    aiCycleHistorySummary: {
      findFirst: () => null,
      create: ({
        data,
      }: {
        data: {
          userId: string;
          scope: string;
          areaId?: string | null;
          summaryText: string;
        };
      }) => ({
        id: nextId('history-summary', aiSummaries),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    aiProposalAudit: {
      create: ({
        data,
      }: {
        data: { userId: string; provider: string; model: string };
      }) => {
        const entry = {
          id: nextId('ai-audit', aiProposalAudits),
          userId: data.userId,
          provider: data.provider,
          model: data.model,
        };
        aiProposalAudits.push(entry);
        return entry;
      },
    },
    performanceScaleConfig: {
      findFirst: () => null,
    },
    cycleAuditLog: {
      create: ({ data }: { data: { userId: string; action: string } }) => {
        const entry = {
          id: nextId('audit', auditLogs),
          userId: data.userId,
          action: data.action,
        };
        auditLogs.push(entry);
        return entry;
      },
    },
  });

  return { prismaMock, planReleases, questionSets };
};

describe('AI Orchestrator (integration)', () => {
  let orchestrator: OrchestratorService;
  const originalAiProvider = process.env.AI_PROVIDER;
  let planReleases: PlanReleaseRecord[];
  let questionSets: Array<{
    id: string;
    userId: string;
    areaId: string;
    status: string;
    approvals: Array<{ status: string }>;
  }>;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'stub';
    const {
      prismaMock,
      planReleases: plans,
      questionSets: sets,
    } = makePrismaMock();
    planReleases = plans;
    questionSets = sets;

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    orchestrator = moduleFixture.get(OrchestratorService);
  });

  afterAll(async () => {
    await moduleFixture.close();
    if (originalAiProvider === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = originalAiProvider;
    }
  });

  beforeEach(() => {
    planReleases.length = 0;
    questionSets.length = 0;
  });

  it('runs cycles independently per area when runAllAreas is true', async () => {
    const results = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      undefined,
      true,
    );

    expect(results).toHaveLength(2);
    const areaIds = results.map((item) => item.areaId).sort();
    expect(areaIds).toEqual(['area-1', 'area-2']);
  });

  it('runs a cycle for a single area without touching others', async () => {
    const results = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      'area-1',
      false,
    );

    expect(results).toHaveLength(1);
    expect(results[0].areaId).toBe('area-1');
    expect(planReleases).toHaveLength(1);
    expect(planReleases[0].areaId).toBe('area-1');
  });

  it('publishes a cycle only after approvals and archives previous ACTIVE plan', async () => {
    const [proposal] = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      'area-1',
      false,
    );
    expect(planReleases).toHaveLength(1);
    expect(planReleases[0].status).toBe('PENDING_APPROVAL');

    questionSets[0].approvals = questionSets[0].approvals.map(() => ({
      status: 'APPROVED',
    }));

    await orchestrator.publishCycle(proposal.planReleaseId, 'admin-1');
    expect(planReleases[0].status).toBe('ACTIVE');

    planReleases[0].activityStatus = 'COMPLETED';
    questionSets[0].status = 'CLOSED';

    await orchestrator.runProposalBatch(['user-1'], 'admin-1', 'area-1', false);
    expect(planReleases).toHaveLength(2);

    questionSets[1].approvals = questionSets[1].approvals.map(() => ({
      status: 'APPROVED',
    }));
    await orchestrator.publishCycle(planReleases[1].id, 'admin-1');
    const active = planReleases.filter((plan) => plan.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(2);

    const archived = planReleases.find((plan) => plan.version === 1);
    expect(archived?.status).toBe('ARCHIVED');
  });

  it('blocks publish when approvals are missing', async () => {
    const [proposal] = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      'area-1',
      false,
    );
    await expect(
      orchestrator.publishCycle(proposal.planReleaseId, 'admin-1'),
    ).rejects.toThrow('Non tutte le aree del questionario sono approvate');
  });

  it('blocks proposal while the active cycle is not completed', async () => {
    planReleases.push({
      id: 'plan-active',
      userId: 'user-1',
      areaId: 'area-1',
      version: 99,
      status: 'ACTIVE',
      createdAt: new Date(),
    });

    await expect(
      orchestrator.runProposalBatch(['user-1'], 'admin-1', 'area-1', false),
    ).rejects.toThrow(
      'L attivita dell allenamento precedente deve essere completata prima di generare un nuovo ciclo',
    );
    const stillActive = planReleases.find((plan) => plan.id === 'plan-active');
    expect(stillActive?.status).toBe('ACTIVE');
  });

  it('rejects a proposal cycle and releases the pending block', async () => {
    const [proposal] = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      'area-1',
      false,
    );

    await orchestrator.rejectCycleProposal(
      proposal.planReleaseId,
      'pro-1',
      'Needs clearer wording',
    );

    expect(planReleases[0].status).toBe('REJECTED');
    expect(questionSets[0].status).toBe('REJECTED');

    const [regenerated] = await orchestrator.runProposalBatch(
      ['user-1'],
      'admin-1',
      'area-1',
      false,
    );
    expect(regenerated.planReleaseId).not.toBe(proposal.planReleaseId);
    expect(planReleases).toHaveLength(2);
  });
});
