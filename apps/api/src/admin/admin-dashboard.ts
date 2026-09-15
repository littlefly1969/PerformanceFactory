import { PrismaService } from '../prisma/prisma.service';

export async function getDashboard(prisma: PrismaService) {
  const [
    users,
    areas,
    professionals,
    pendingCycles,
    readyCycles,
    pendingQuestionApprovals,
    pendingPlanItems,
    sports,
    pendingTrainingPlans,
    readyTrainingPlans,
  ] = await Promise.all([
    prisma.user.findMany({
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
        sportSelection: {
          select: {
            specializationId: true,
            sport: { select: { id: true, label: true } },
            specialization: { select: { id: true, label: true } },
          },
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
        athleteCoachLinks: {
          select: {
            coachId: true,
            specializationId: true,
            coach: { select: { id: true, email: true } },
            specialization: {
              select: {
                id: true,
                label: true,
                sport: { select: { id: true, label: true } },
              },
            },
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
        trainingPlanReleases: {
          where: { status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
          select: {
            id: true,
            version: true,
            status: true,
            cycleStatus: true,
            createdAt: true,
            publishedAt: true,
            summaryText: true,
            specialization: {
              select: {
                id: true,
                label: true,
                sport: { select: { id: true, label: true } },
              },
            },
            items: { select: { status: true } },
            questionSets: {
              select: {
                status: true,
                approvals: {
                  select: {
                    status: true,
                    coach: { select: { id: true, email: true } },
                  },
                },
              },
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
    prisma.area.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
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
        coachSpecializationCompetences: {
          select: {
            specializationId: true,
            specialization: {
              select: {
                id: true,
                label: true,
                sport: { select: { id: true, label: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        coachUserLinks: {
          select: {
            userId: true,
            specializationId: true,
            user: { select: { id: true, email: true } },
            specialization: {
              select: {
                id: true,
                label: true,
                sport: { select: { id: true, label: true } },
              },
            },
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    prisma.improvementPlanRelease.findMany({
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
    prisma.improvementPlanRelease.findMany({
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
    prisma.questionSetAreaApproval.findMany({
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
    prisma.planItem.findMany({
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
    prisma.sport.findMany({
      where: { isActive: true },
      select: {
        id: true,
        label: true,
        specializations: {
          where: { isActive: true },
          select: { id: true, label: true },
          orderBy: { label: 'asc' },
        },
      },
      orderBy: { label: 'asc' },
    }),
    prisma.trainingPlanRelease.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        specializationId: true,
        version: true,
        status: true,
        cycleStatus: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
        specialization: {
          select: {
            id: true,
            label: true,
            sport: { select: { id: true, label: true } },
          },
        },
        items: { select: { id: true, status: true } },
        questionSets: {
          select: {
            id: true,
            status: true,
            approvals: {
              select: {
                id: true,
                status: true,
                coach: { select: { id: true, email: true } },
              },
            },
          },
        },
      },
    }),
    prisma.trainingPlanRelease.findMany({
      where: { status: 'PENDING_APPROVAL', cycleStatus: 'READY_TO_PUBLISH' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        specializationId: true,
        version: true,
        cycleStatus: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
        specialization: {
          select: {
            id: true,
            label: true,
            sport: { select: { id: true, label: true } },
          },
        },
      },
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
        (plan) => plan.areaId === area.id && plan.status === 'PENDING_APPROVAL',
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
            ? 'Approvazione gia in attesa'
            : !user.isActive
              ? 'Atleta in attesa di attivazione amministratore'
              : !activeActivitiesCompleted
                ? 'Attivita precedente non completata'
                : 'Questionario precedente non completato'
          : generationReady
            ? active
              ? 'Pronto per il prossimo ciclo'
              : 'Pronto per la prima proposta AI'
            : 'Onboarding non completato',
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
      trainingState: {
        sportSelection: user.sportSelection,
        linkedCoach: user.sportSelection
          ? (user.athleteCoachLinks.find(
              (link) =>
                link.specializationId === user.sportSelection?.specializationId,
            )?.coach ?? null)
          : null,
        pendingTraining:
          user.trainingPlanReleases.find(
            (training) => training.status === 'PENDING_APPROVAL',
          ) ?? null,
        activeTraining:
          user.trainingPlanReleases.find(
            (training) => training.status === 'ACTIVE',
          ) ?? null,
        generationReady:
          user.isActive &&
          user.onboardingAssessment?.status === 'COMPLETED' &&
          Boolean(user.sportSelection) &&
          Boolean(
            user.sportSelection &&
            user.athleteCoachLinks.some(
              (link) =>
                link.specializationId === user.sportSelection?.specializationId,
            ),
          ) &&
          !user.trainingPlanReleases.some(
            (training) => training.status === 'PENDING_APPROVAL',
          ),
        reason: !user.isActive
          ? 'Atleta in attesa di attivazione amministratore'
          : user.onboardingAssessment?.status !== 'COMPLETED'
            ? 'Onboarding non completato'
            : !user.sportSelection
              ? 'Sport-specializzazione non selezionata'
              : !user.athleteCoachLinks.some(
                    (link) =>
                      link.specializationId ===
                      user.sportSelection?.specializationId,
                  )
                ? 'Allenatore non assegnato'
                : user.trainingPlanReleases.some(
                      (training) => training.status === 'PENDING_APPROVAL',
                    )
                  ? 'Allenamento gia in approvazione'
                  : user.trainingPlanReleases.some(
                        (training) => training.status === 'ACTIVE',
                      )
                    ? 'Pronto per rigenerare allenamento'
                    : 'Pronto per il primo allenamento',
      },
      areaStates,
    };
  });

  return {
    areas,
    athletes,
    professionals,
    pendingCycles,
    readyCycles,
    pendingTrainingPlans,
    readyTrainingPlans,
    pendingQuestionApprovals: pendingQuestionApprovalsWithRouting,
    pendingPlanItems: pendingPlanItemsByProfessional,
    sports,
  };
}
