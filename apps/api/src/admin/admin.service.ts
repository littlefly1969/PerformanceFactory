import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertAiPromptConfigDto } from './dto/upsert-ai-prompt-config.dto';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';

const DEFAULT_INITIAL_CONTEXT =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e tre domande di monitoraggio usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';

const DEFAULT_RESPONSE_FORMAT_PROMPT =
  'La risposta deve contenere una sintesi breve, da uno a tre esercizi/attivita con titolo e descrizione operativa, e tre domande di monitoraggio. Ogni attivita deve indicare azione, frequenza o trigger, criterio misurabile di successo e progressione. Le domande devono essere brevi, osservabili e collegate al lavoro proposto.';

const DEFAULT_QUESTIONNAIRE_LAYOUT_JSON = {
  questionnaire: {
    questions: 3,
    answerOptions: [
      { label: 'Non ancora', score: 0 },
      { label: 'A volte', score: 50 },
      { label: 'Spesso', score: 75 },
      { label: 'Con costanza', score: 100 },
    ],
    questionStyle: 'breve, concreta, misurabile',
    focus: 'aderenza o esecuzione osservabile del lavoro proposto',
  },
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async getDashboard() {
    const [
      users,
      areas,
      professionals,
      pendingCycles,
      readyCycles,
      pendingQuestionApprovals,
      pendingPlanItems,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'USER' },
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
          onboardingAssessment: {
            select: { status: true, completedAt: true },
          },
          userLinks: {
            select: {
              professionalId: true,
              areaId: true,
              professional: { select: { id: true, email: true } },
              area: { select: { id: true, name: true } },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          planReleases: {
            where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
            select: {
              id: true,
              areaId: true,
              version: true,
              status: true,
              cycleStatus: true,
              createdAt: true,
              publishedAt: true,
              area: { select: { id: true, name: true } },
              items: { select: { status: true } },
              questionSets: {
                select: { status: true, closedAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          questionSets: {
            where: { status: { in: ['PUBLISHED', 'PENDING_APPROVAL'] } },
            select: {
              id: true,
              areaId: true,
              status: true,
              createdAt: true,
              publishedAt: true,
              closedAt: true,
              area: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          performanceProfileSnapshots: {
            select: {
              id: true,
              rankingGlobal: true,
              createdAt: true,
              areas: {
                select: {
                  areaId: true,
                  realR: true,
                  potentialP: true,
                  area: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.area.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: 'PROFESSIONAL' },
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          professionalAreaCompetences: {
            select: {
              areaId: true,
              area: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          professionalLinks: {
            select: {
              userId: true,
              areaId: true,
              user: { select: { id: true, email: true } },
              area: { select: { id: true, name: true } },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.improvementPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          areaId: true,
          version: true,
          status: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
          items: { select: { id: true, status: true } },
          questionSets: {
            select: {
              id: true,
              status: true,
              approvals: {
                select: {
                  id: true,
                  status: true,
              professional: { select: { id: true, email: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.improvementPlanRelease.findMany({
        where: { status: 'PENDING_APPROVAL', cycleStatus: 'READY_TO_PUBLISH' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          areaId: true,
          version: true,
          cycleStatus: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
        },
      }),
      this.prisma.questionSetAreaApproval.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          professionalId: true,
          areaId: true,
          professional: { select: { id: true, email: true } },
          area: { select: { id: true, name: true } },
          questionSet: {
            select: {
              id: true,
              user: { select: { id: true, email: true } },
              planReleaseId: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.planItem.findMany({
        where: {
          status: 'PROPOSED',
          planRelease: { status: 'PENDING_APPROVAL' },
        },
        select: {
          id: true,
          areaId: true,
          area: { select: { id: true, name: true } },
          planRelease: {
            select: {
              id: true,
              user: { select: { id: true, email: true } },
              userId: true,
              questionSets: {
                select: {
                  approvals: {
                    select: {
                      professional: { select: { id: true, email: true } },
                    },
                    take: 1,
                  },
                },
                take: 1,
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const linkedProfessionalFor = (userId: string, areaId: string) => {
      const user = users.find((item) => item.id === userId);
      return (
        user?.userLinks.find((link) => link.areaId === areaId)?.professional ??
        null
      );
    };

    const pendingQuestionApprovalsWithRouting = pendingQuestionApprovals.map(
      (approval) => {
        const currentProfessional = linkedProfessionalFor(
          approval.questionSet.user.id,
          approval.areaId,
        );
        return {
          ...approval,
          currentProfessional,
          routingMismatch:
            Boolean(currentProfessional) &&
            currentProfessional?.id !== approval.professionalId,
        };
      },
    );

    const pendingPlanItemsByProfessional = pendingPlanItems.map((item) => ({
      id: item.id,
      area: item.area,
      planReleaseId: item.planRelease.id,
      user: item.planRelease.user,
      professional:
        linkedProfessionalFor(item.planRelease.userId, item.areaId) ??
        item.planRelease.questionSets[0]?.approvals[0]?.professional ??
        null,
    }));

    const athletes = users.map((user) => {
      const latestSnapshot = user.performanceProfileSnapshots[0] ?? null;
      const areaStates = areas.map((area) => {
        const link = user.userLinks.find((item) => item.areaId === area.id);
        const pending = user.planReleases.find(
          (plan) =>
            plan.areaId === area.id && plan.status === 'PENDING_APPROVAL',
        );
        const active = user.planReleases.find(
          (plan) => plan.areaId === area.id && plan.status === 'ACTIVE',
        );
        const questionSet = user.questionSets.find(
          (set) => set.areaId === area.id,
        );
        const snapshotArea = latestSnapshot?.areas.find(
          (snapshot) => snapshot.areaId === area.id,
        );
        const activeActivitiesCompleted =
          !active ||
          (active.items.length > 0 &&
            active.items.every((item) => item.status === 'COMPLETED'));
        const activeQuestionnaireCompleted =
          !active || active.questionSets.some((set) => set.status === 'CLOSED');
        const activeCycleCompleted =
          activeActivitiesCompleted && activeQuestionnaireCompleted;
        const generationBlocked =
          !user.isActive ||
          Boolean(pending) ||
          (user.onboardingAssessment?.status === 'COMPLETED' &&
            !activeCycleCompleted);
        const generationReady =
          user.isActive &&
          user.onboardingAssessment?.status === 'COMPLETED' &&
          !pending &&
          activeCycleCompleted;

        return {
          area,
          snapshot: snapshotArea
            ? {
                realR: snapshotArea.realR,
                potentialP: snapshotArea.potentialP,
              }
            : null,
          pendingCycle: pending ?? null,
          activeCycle: active ?? null,
          currentQuestionSet: questionSet ?? null,
          linkedProfessional: link?.professional ?? null,
          generationReady,
          generationBlocked,
          reason: generationBlocked
            ? pending
              ? 'Pending approval already exists'
              : !user.isActive
                ? 'Athlete pending admin activation'
              : !activeActivitiesCompleted
                ? 'Previous activity is not completed'
                : 'Previous questionnaire is not completed'
            : generationReady
              ? active
                ? 'Ready for next cycle'
                : 'Ready for first AI proposal'
              : 'Onboarding not completed',
        };
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        createdAt: user.createdAt,
        onboarding: user.onboardingAssessment ?? {
          status: 'PENDING',
          completedAt: null,
        },
        linkedProfessionals: user.userLinks.map((link) => ({
          area: link.area,
          professional: link.professional,
          createdAt: link.createdAt,
        })),
        latestSnapshot,
        areaStates,
      };
    });

    return {
      areas,
      athletes,
      professionals,
      pendingCycles,
      readyCycles,
      pendingQuestionApprovals: pendingQuestionApprovalsWithRouting,
      pendingPlanItems: pendingPlanItemsByProfessional,
    };
  }

  async setUserActive(userId: string, isActive: boolean) {
    if (!userId) {
      throw new BadRequestException('Missing user id');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Athlete not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive,
        onboardingAssessment: {
          upsert: {
            update: {},
            create: { status: 'PENDING' },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
      },
    });
  }

  async getAiSettings() {
    const areas = await this.prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    await this.ensureAreaGenerationConfigs(areas.map((area) => area.id));

    const [promptConfigs, areaGenerationConfigs, onboardingTemplates] = await Promise.all([
      this.prisma.aiPromptConfig.findMany({
        select: {
          id: true,
          name: true,
          basePrompt: true,
          areaId: true,
          athleteLevel: true,
          version: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          area: { select: { id: true, name: true } },
        },
        orderBy: [{ areaId: 'asc' }, { athleteLevel: 'asc' }, { version: 'desc' }],
      }),
      this.prisma.aiAreaGenerationConfig.findMany({
        select: {
          id: true,
          areaId: true,
          initialContext: true,
          responseFormatPrompt: true,
          questionnaireLayoutJson: true,
          updatedAt: true,
          area: { select: { id: true, name: true } },
        },
        orderBy: [{ area: { name: 'asc' } }],
      }),
      this.prisma.onboardingQuestionTemplate.findMany({
        select: {
          id: true,
          key: true,
          scope: true,
          areaId: true,
          label: true,
          helpText: true,
          inputType: true,
          optionsJson: true,
          required: true,
          orderIndex: true,
          isActive: true,
          updatedAt: true,
          area: { select: { id: true, name: true } },
        },
        orderBy: [{ scope: 'asc' }, { areaId: 'asc' }, { orderIndex: 'asc' }],
      }),
    ]);

    return {
      areas,
      levels: ['BASELINE', 'STABLE', 'ADVANCED'],
      promptConfigs,
      areaGenerationConfigs,
      onboardingTemplates,
      inputTypes: Object.values(OnboardingInputType),
      scopes: Object.values(OnboardingQuestionScope),
    };
  }

  private async ensureAreaGenerationConfigs(areaIds: string[]) {
    if (!areaIds.length) {
      return;
    }

    await this.prisma.aiAreaGenerationConfig.createMany({
      data: areaIds.map((areaId) => ({
        id: `area-generation-config-${areaId}`,
        areaId,
        initialContext: DEFAULT_INITIAL_CONTEXT,
        responseFormatPrompt: DEFAULT_RESPONSE_FORMAT_PROMPT,
        questionnaireLayoutJson: DEFAULT_QUESTIONNAIRE_LAYOUT_JSON,
      })),
      skipDuplicates: true,
    });
  }

  async upsertAiPromptConfig(body: UpsertAiPromptConfigDto, actorId: string) {
    const name = body.name?.trim();
    const basePrompt = body.basePrompt?.trim();
    const athleteLevel = body.athleteLevel?.trim().toUpperCase();
    const areaId = body.areaId || null;
    const isActive = body.isActive ?? true;

    if (!actorId || !name || !basePrompt || !athleteLevel) {
      throw new BadRequestException('Missing prompt configuration fields');
    }
    if (areaId) {
      const area = await this.prisma.area.findUnique({
        where: { id: areaId },
        select: { id: true },
      });
      if (!area) {
        throw new BadRequestException('Invalid area');
      }
    }

    const duplicateName = await this.prisma.aiPromptConfig.findUnique({
      where: { name },
      select: { id: true },
    });

    if (body.id) {
      const existing = await this.prisma.aiPromptConfig.findUnique({
        where: { id: body.id },
        select: {
          id: true,
          name: true,
          areaId: true,
          athleteLevel: true,
          version: true,
        },
      });
      if (!existing) {
        throw new NotFoundException('Prompt configuration not found');
      }

      const identityChanged =
        existing.name !== name ||
        existing.areaId !== areaId ||
        existing.athleteLevel !== athleteLevel;

      if (duplicateName && duplicateName.id !== existing.id) {
        throw new BadRequestException('Prompt name already exists');
      }

      if (identityChanged) {
        if (duplicateName) {
          throw new BadRequestException('Prompt name already exists');
        }
        return this.createAiPromptConfig({
          name,
          basePrompt,
          athleteLevel,
          areaId,
          isActive,
          actorId,
          version: 1,
        });
      }

      return this.prisma.$transaction(async (tx) => {
        if (isActive) {
          await this.deactivatePromptPeers(tx, areaId, athleteLevel, existing.id);
        }

        return tx.aiPromptConfig.update({
          where: { id: body.id },
          data: {
            basePrompt,
            isActive,
            version: { increment: 1 },
            updatedById: actorId,
          },
        });
      });
    }

    if (duplicateName) {
      throw new BadRequestException('Prompt name already exists');
    }

    return this.createAiPromptConfig({
      name,
      basePrompt,
      athleteLevel,
      areaId,
      isActive,
      actorId,
      version: 1,
    });
  }

  private async createAiPromptConfig(input: {
    name: string;
    basePrompt: string;
    athleteLevel: string;
    areaId: string | null;
    isActive: boolean;
    actorId: string;
    version: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await this.deactivatePromptPeers(
          tx,
          input.areaId,
          input.athleteLevel,
        );
      }

      return tx.aiPromptConfig.create({
        data: {
          name: input.name,
          basePrompt: input.basePrompt,
          athleteLevel: input.athleteLevel,
          areaId: input.areaId,
          isActive: input.isActive,
          version: input.version,
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
    });
  }

  private async deactivatePromptPeers(
    tx: Prisma.TransactionClient,
    areaId: string | null,
    athleteLevel: string,
    excludeId?: string,
  ) {
    await tx.aiPromptConfig.updateMany({
      where: {
        athleteLevel,
        areaId,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: {
        isActive: false,
      },
    });
  }

  async upsertAiAreaGenerationConfig(
    body: UpsertAiAreaGenerationConfigDto,
    actorId: string,
  ) {
    const areaId = body.areaId?.trim();
    const initialContext = body.initialContext?.trim();
    const responseFormatPrompt = body.responseFormatPrompt?.trim();

    if (!actorId || !areaId || !initialContext || !responseFormatPrompt) {
      throw new BadRequestException('Missing area AI configuration fields');
    }
    if (
      body.questionnaireLayoutJson === undefined ||
      body.questionnaireLayoutJson === null ||
      Array.isArray(body.questionnaireLayoutJson) ||
      typeof body.questionnaireLayoutJson !== 'object'
    ) {
      throw new BadRequestException('Questionnaire layout must be a JSON object');
    }

    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestException('Invalid area');
    }

    if (body.id) {
      const existing = await this.prisma.aiAreaGenerationConfig.findUnique({
        where: { id: body.id },
        select: { id: true, areaId: true },
      });
      if (!existing) {
        throw new NotFoundException('Area AI configuration not found');
      }
      if (existing.areaId !== areaId) {
        throw new BadRequestException(
          'Area cannot be changed for this configuration',
        );
      }
    }

    return this.prisma.aiAreaGenerationConfig.upsert({
      where: { areaId },
      update: {
        initialContext,
        responseFormatPrompt,
        questionnaireLayoutJson:
          body.questionnaireLayoutJson as Prisma.InputJsonValue,
        updatedById: actorId,
      },
      create: {
        areaId,
        initialContext,
        responseFormatPrompt,
        questionnaireLayoutJson:
          body.questionnaireLayoutJson as Prisma.InputJsonValue,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  }

  async upsertOnboardingTemplate(
    body: UpsertOnboardingTemplateDto,
    actorId: string,
  ) {
    const key = body.key?.trim();
    const label = body.label?.trim();
    if (!actorId || !key || !label || !body.scope || !body.inputType) {
      throw new BadRequestException('Missing onboarding template fields');
    }

    if (
      body.scope === OnboardingQuestionScope.AREA &&
      !body.areaId
    ) {
      throw new BadRequestException('Area questions require an area');
    }
    if (body.areaId) {
      const area = await this.prisma.area.findUnique({
        where: { id: body.areaId },
        select: { id: true },
      });
      if (!area) {
        throw new BadRequestException('Invalid area');
      }
    }

    const data = {
      key,
      scope: body.scope,
      areaId:
        body.scope === OnboardingQuestionScope.AREA ? body.areaId ?? null : null,
      label,
      helpText: body.helpText?.trim() || null,
      inputType: body.inputType,
      optionsJson:
        body.optionsJson === undefined
          ? Prisma.JsonNull
          : (body.optionsJson as Prisma.InputJsonValue),
      required: body.required ?? true,
      orderIndex: Number(body.orderIndex) || 0,
      isActive: body.isActive ?? true,
      updatedById: actorId,
    };

    if (body.id) {
      const existing = await this.prisma.onboardingQuestionTemplate.findUnique({
        where: { id: body.id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Onboarding template not found');
      }
      return this.prisma.onboardingQuestionTemplate.update({
        where: { id: body.id },
        data,
      });
    }

    return this.prisma.onboardingQuestionTemplate.create({
      data: {
        ...data,
        createdById: actorId,
      },
    });
  }

  async closeAnsweredQuestionnaires() {
    const questionSets = await this.prisma.questionSet.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        questions: {
          select: {
            id: true,
            answers: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const closable = questionSets.filter(
      (set) =>
        set.questions.length > 0 &&
        set.questions.every((question) => question.answers.length > 0),
    );

    const closed: Array<{
      questionSetId: string;
      userId: string;
      areaId: string;
      snapshotId: string;
    }> = [];

    for (const set of closable) {
      const result = await this.orchestrator.createSnapshotFromQuestionSet(
        set.id,
        'Questionnaire submitted',
      );
      closed.push({
        questionSetId: set.id,
        userId: set.userId,
        areaId: set.areaId,
        snapshotId: result.snapshotId,
      });
    }

    return {
      scanned: questionSets.length,
      closedCount: closed.length,
      closed,
    };
  }
}
