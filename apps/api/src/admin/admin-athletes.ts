import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function setUserActive(
  prisma: PrismaService,
  userId: string,
  isActive: boolean,
) {
  if (!userId) {
    throw new BadRequestException('ID utente mancante');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== UserRole.USER) {
    throw new NotFoundException('Atleta non trovato');
  }

  return prisma.user.update({
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

export async function rejectUserApplication(
  prisma: PrismaService,
  userId: string,
) {
  if (!userId) {
    throw new BadRequestException('ID utente mancante');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user || user.role !== UserRole.USER) {
    throw new NotFoundException('Atleta non trovato');
  }
  if (user.isActive) {
    throw new BadRequestException(
      'Puoi rifiutare solo una candidatura atleta in attesa',
    );
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      onboardingAssessment: {
        upsert: {
          update: {
            status: 'REJECTED',
            answersJson: Prisma.JsonNull,
            profileJson: Prisma.JsonNull,
            completedAt: null,
          },
          create: { status: 'REJECTED' },
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
      onboardingAssessment: { select: { status: true } },
    },
  });
}

export async function resetUserOperationalData(
  prisma: PrismaService,
  userId: string,
) {
  if (!userId) {
    throw new BadRequestException('ID utente mancante');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
    },
  });
  if (!user || user.role !== UserRole.USER) {
    throw new NotFoundException('Atleta non trovato');
  }

  return prisma.$transaction(async (tx) => {
    const questionSetIds = (
      await tx.questionSet.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((item) => item.id);
    const planReleaseIds = (
      await tx.improvementPlanRelease.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((item) => item.id);
    const trainingPlanReleaseIds = (
      await tx.trainingPlanRelease.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((item) => item.id);
    const snapshotIds = (
      await tx.performanceProfileSnapshot.findMany({
        where: { userId },
        select: { id: true },
      })
    ).map((item) => item.id);
    const questionIds = questionSetIds.length
      ? (
          await tx.question.findMany({
            where: { questionSetId: { in: questionSetIds } },
            select: { id: true },
          })
        ).map((item) => item.id)
      : [];
    const trainingQuestionSetIds = (
      await tx.trainingQuestionSet.findMany({
        where: {
          OR: [
            { userId },
            ...(trainingPlanReleaseIds.length
              ? [
                  {
                    trainingPlanReleaseId: {
                      in: trainingPlanReleaseIds,
                    },
                  },
                ]
              : []),
          ],
        },
        select: { id: true },
      })
    ).map((item) => item.id);
    const trainingQuestionIds = trainingQuestionSetIds.length
      ? (
          await tx.trainingQuestion.findMany({
            where: {
              trainingQuestionSetId: { in: trainingQuestionSetIds },
            },
            select: { id: true },
          })
        ).map((item) => item.id)
      : [];
    const aiProposalAuditWhere: Prisma.AiProposalAuditWhereInput[] = [
      { userId },
    ];
    if (planReleaseIds.length) {
      aiProposalAuditWhere.push({ planReleaseId: { in: planReleaseIds } });
    }
    if (questionSetIds.length) {
      aiProposalAuditWhere.push({ questionSetId: { in: questionSetIds } });
    }
    const aiContextSummaryWhere: Prisma.AiContextSummaryWhereInput[] = [
      { userId },
    ];
    if (planReleaseIds.length) {
      aiContextSummaryWhere.push({ planReleaseId: { in: planReleaseIds } });
    }
    const userAnswerWhere: Prisma.UserAnswerWhereInput[] = [{ userId }];
    if (questionIds.length) {
      userAnswerWhere.push({ questionId: { in: questionIds } });
    }
    const trainingUserAnswerWhere: Prisma.TrainingUserAnswerWhereInput[] = [
      { userId },
    ];
    if (trainingQuestionIds.length) {
      trainingUserAnswerWhere.push({
        trainingQuestionId: { in: trainingQuestionIds },
      });
    }

    const deleted = {
      consents: (await tx.consent.deleteMany({ where: { userId } })).count,
      dataAccessAudits: (
        await tx.dataAccessAudit.deleteMany({
          where: { OR: [{ targetUserId: userId }, { actorId: userId }] },
        })
      ).count,
      cycleAuditLogs: (
        await tx.cycleAuditLog.deleteMany({
          where: { OR: [{ userId }, { actorId: userId }] },
        })
      ).count,
      aiProposalAudits: (
        await tx.aiProposalAudit.deleteMany({
          where: {
            OR: aiProposalAuditWhere,
          },
        })
      ).count,
      aiContextSummaries: (
        await tx.aiContextSummary.deleteMany({
          where: {
            OR: aiContextSummaryWhere,
          },
        })
      ).count,
      aiCycleHistorySummaries: (
        await tx.aiCycleHistorySummary.deleteMany({ where: { userId } })
      ).count,
      questionSetApprovals: questionSetIds.length
        ? (
            await tx.questionSetAreaApproval.deleteMany({
              where: { questionSetId: { in: questionSetIds } },
            })
          ).count
        : 0,
      userAnswers: (
        await tx.userAnswer.deleteMany({
          where: {
            OR: userAnswerWhere,
          },
        })
      ).count,
      answerOptions: questionIds.length
        ? (
            await tx.answerOption.deleteMany({
              where: { questionId: { in: questionIds } },
            })
          ).count
        : 0,
      questions: questionSetIds.length
        ? (
            await tx.question.deleteMany({
              where: { questionSetId: { in: questionSetIds } },
            })
          ).count
        : 0,
      questionSets: (await tx.questionSet.deleteMany({ where: { userId } }))
        .count,
      planItems: planReleaseIds.length
        ? (
            await tx.planItem.deleteMany({
              where: { planReleaseId: { in: planReleaseIds } },
            })
          ).count
        : 0,
      planReleases: (
        await tx.improvementPlanRelease.deleteMany({ where: { userId } })
      ).count,
      trainingUserAnswers: (
        await tx.trainingUserAnswer.deleteMany({
          where: { OR: trainingUserAnswerWhere },
        })
      ).count,
      trainingAnswerOptions: trainingQuestionIds.length
        ? (
            await tx.trainingAnswerOption.deleteMany({
              where: { trainingQuestionId: { in: trainingQuestionIds } },
            })
          ).count
        : 0,
      trainingQuestions: trainingQuestionSetIds.length
        ? (
            await tx.trainingQuestion.deleteMany({
              where: {
                trainingQuestionSetId: { in: trainingQuestionSetIds },
              },
            })
          ).count
        : 0,
      trainingQuestionSetApprovals: trainingQuestionSetIds.length
        ? (
            await tx.trainingQuestionSetCoachApproval.deleteMany({
              where: {
                trainingQuestionSetId: { in: trainingQuestionSetIds },
              },
            })
          ).count
        : 0,
      trainingQuestionSets: (
        await tx.trainingQuestionSet.deleteMany({ where: { userId } })
      ).count,
      trainingPlanItems: trainingPlanReleaseIds.length
        ? (
            await tx.trainingPlanItem.deleteMany({
              where: {
                trainingPlanReleaseId: { in: trainingPlanReleaseIds },
              },
            })
          ).count
        : 0,
      trainingPlanReleases: (
        await tx.trainingPlanRelease.deleteMany({ where: { userId } })
      ).count,
      snapshotAreas: snapshotIds.length
        ? (
            await tx.performanceProfileSnapshotArea.deleteMany({
              where: { snapshotId: { in: snapshotIds } },
            })
          ).count
        : 0,
      snapshots: (
        await tx.performanceProfileSnapshot.deleteMany({ where: { userId } })
      ).count,
      professionalLinks: (
        await tx.professionalUserLink.deleteMany({
          where: { OR: [{ userId }, { professionalId: userId }] },
        })
      ).count,
      coachLinks: (
        await tx.coachUserLink.deleteMany({
          where: { OR: [{ userId }, { coachId: userId }] },
        })
      ).count,
      feedbackEntries: (
        await tx.feedbackEntry.deleteMany({ where: { userId } })
      ).count,
      assignments: (await tx.userAssignment.deleteMany({ where: { userId } }))
        .count,
      currentStates: (await tx.currentState.deleteMany({ where: { userId } }))
        .count,
      kpiDaily: (await tx.kpiDaily.deleteMany({ where: { userId } })).count,
      aiInteractions: (await tx.aiInteraction.deleteMany({ where: { userId } }))
        .count,
      onboardingQuestions: (
        await tx.userOnboardingQuestion.deleteMany({ where: { userId } })
      ).count,
      sportSelection: (
        await tx.userSportSelection.deleteMany({ where: { userId } })
      ).count,
      areaPromptInstructions: (
        await tx.userAreaPromptInstruction.deleteMany({ where: { userId } })
      ).count,
      performanceGoal: (
        await tx.userPerformanceGoal.deleteMany({ where: { userId } })
      ).count,
      onboardingAssessment: (
        await tx.userOnboardingAssessment.deleteMany({ where: { userId } })
      ).count,
    };

    const resetUser = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
        onboardingAssessment: { select: { status: true } },
      },
    });

    const residual = {
      consents: await tx.consent.count({ where: { userId } }),
      onboardingAssessment: await tx.userOnboardingAssessment.count({
        where: { userId },
      }),
      onboardingQuestions: await tx.userOnboardingQuestion.count({
        where: { userId },
      }),
      sportSelection: await tx.userSportSelection.count({
        where: { userId },
      }),
      performanceGoal: await tx.userPerformanceGoal.count({
        where: { userId },
      }),
      areaPromptInstructions: await tx.userAreaPromptInstruction.count({
        where: { userId },
      }),
      planReleases: await tx.improvementPlanRelease.count({
        where: { userId },
      }),
      trainingPlanReleases: await tx.trainingPlanRelease.count({
        where: { userId },
      }),
      questionSets: await tx.questionSet.count({ where: { userId } }),
      trainingQuestionSets: await tx.trainingQuestionSet.count({
        where: { userId },
      }),
      userAnswers: await tx.userAnswer.count({ where: { userId } }),
      trainingUserAnswers: await tx.trainingUserAnswer.count({
        where: { userId },
      }),
      snapshots: await tx.performanceProfileSnapshot.count({
        where: { userId },
      }),
      professionalLinks: await tx.professionalUserLink.count({
        where: { OR: [{ userId }, { professionalId: userId }] },
      }),
      coachLinks: await tx.coachUserLink.count({
        where: { OR: [{ userId }, { coachId: userId }] },
      }),
      feedbackEntries: await tx.feedbackEntry.count({ where: { userId } }),
      assignments: await tx.userAssignment.count({ where: { userId } }),
      currentStates: await tx.currentState.count({ where: { userId } }),
      kpiDaily: await tx.kpiDaily.count({ where: { userId } }),
      aiInteractions: await tx.aiInteraction.count({ where: { userId } }),
      aiContextSummaries: await tx.aiContextSummary.count({
        where: { userId },
      }),
      aiCycleHistorySummaries: await tx.aiCycleHistorySummary.count({
        where: { userId },
      }),
      aiProposalAudits: await tx.aiProposalAudit.count({ where: { userId } }),
      dataAccessAudits: await tx.dataAccessAudit.count({
        where: { OR: [{ targetUserId: userId }, { actorId: userId }] },
      }),
      cycleAuditLogs: await tx.cycleAuditLog.count({
        where: { OR: [{ userId }, { actorId: userId }] },
      }),
    };

    return { user: resetUser, deleted, residual };
  });
}

export async function deleteAthleteCompletely(
  prisma: PrismaService,
  userId: string,
) {
  if (!userId) {
    throw new BadRequestException('ID utente mancante');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  });
  if (!user || user.role !== UserRole.USER) {
    throw new NotFoundException('Atleta non trovato');
  }

  const reset = await resetUserOperationalData(prisma, userId);

  return prisma.$transaction(async (tx) => {
    const deleted = {
      ...reset.deleted,
      authIdentities: (await tx.authIdentity.deleteMany({ where: { userId } }))
        .count,
    };
    await tx.user.delete({ where: { id: userId } });

    return {
      deleted: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      deletedCounts: deleted,
    };
  });
}
