import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class InspectService {
  constructor(private readonly prisma: PrismaService) {}

  async listCycles() {
    return this.prisma.improvementPlanRelease.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        areaId: true,
        version: true,
        status: true,
        cycleStatus: true,
        createdAt: true,
        publishedAt: true,
        archivedAt: true,
        user: { select: { id: true, email: true, role: true } },
        area: { select: { id: true, name: true } },
      },
    });
  }

  async getCycle(cycleId: string) {
    const planRelease = await this.prisma.improvementPlanRelease.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        userId: true,
        areaId: true,
        version: true,
        status: true,
        cycleStatus: true,
        generatedBy: true,
        createdAt: true,
        publishedAt: true,
        archivedAt: true,
        sourceSnapshotId: true,
        proposedByAdminId: true,
        publishedByAdminId: true,
        user: { select: { id: true, email: true, role: true } },
        area: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            areaId: true,
            type: true,
            title: true,
            body: true,
            metadata: true,
            status: true,
            approvedByProfessionalId: true,
            approvedAt: true,
            rejectedAt: true,
            rejectionReason: true,
            completedAt: true,
            completionNotes: true,
            completionRating: true,
            area: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, email: true } },
          },
          orderBy: { id: 'asc' },
        },
        questionSets: {
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            publishedAt: true,
            closedAt: true,
            areaId: true,
            area: { select: { id: true, name: true } },
            approvals: {
              select: {
                id: true,
                areaId: true,
                status: true,
                professionalId: true,
                approvedByProfessionalId: true,
                approvedAt: true,
                rejectedAt: true,
                rejectionReason: true,
                area: { select: { id: true, name: true } },
                professional: { select: { id: true, email: true } },
                approvedBy: { select: { id: true, email: true } },
              },
              orderBy: { id: 'asc' },
            },
            questions: {
              select: {
                id: true,
                areaId: true,
                text: true,
                objectiveRef: true,
                orderIndex: true,
                options: { select: { id: true, label: true, score: true } },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        aiContextSummaries: {
          select: {
            id: true,
            summaryText: true,
            summaryJson: true,
            createdAt: true,
            cycleStatus: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        aiProposalAudits: {
          select: {
            id: true,
            provider: true,
            model: true,
            promptVersion: true,
            promptHash: true,
            status: true,
            inputJson: true,
            outputJson: true,
            errorMessage: true,
            latencyMs: true,
            createdAt: true,
            questionSetId: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          select: {
            id: true,
            action: true,
            actorId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!planRelease) {
      throw new NotFoundException('Ciclo non trovato');
    }

    const latestSnapshot =
      await this.prisma.performanceProfileSnapshot.findFirst({
        where: { userId: planRelease.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          rankingGlobal: true,
          reason: true,
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
      });

    return { planRelease, latestSnapshot };
  }

  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async createUser(email: string, password: string, role: UserRole) {
    if (!email || !password || !role) {
      throw new BadRequestException('Dati utente mancanti');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Utente gia esistente');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    const [
      activePlans,
      allQuestionSets,
      currentSnapshot,
      snapshotHistory,
      planHistory,
    ] = await Promise.all([
      this.prisma.improvementPlanRelease.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          areaId: true,
          version: true,
          status: true,
          cycleStatus: true,
          createdAt: true,
          area: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              areaId: true,
              type: true,
              title: true,
              body: true,
              status: true,
              completedAt: true,
              completionNotes: true,
              completionRating: true,
              area: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.questionSet.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          type: true,
          createdAt: true,
          publishedAt: true,
          closedAt: true,
          areaId: true,
          area: { select: { id: true, name: true } },
        },
      }),
      this.prisma.performanceProfileSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rankingGlobal: true,
          reason: true,
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
      }),
      this.prisma.performanceProfileSnapshot.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rankingGlobal: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.improvementPlanRelease.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          areaId: true,
          version: true,
          status: true,
          cycleStatus: true,
          createdAt: true,
          publishedAt: true,
          archivedAt: true,
          area: { select: { id: true, name: true } },
        },
      }),
    ]);

    const currentQuestionSetByArea = new Map<
      string,
      (typeof allQuestionSets)[number]
    >();
    for (const set of allQuestionSets) {
      if (!currentQuestionSetByArea.has(set.areaId)) {
        currentQuestionSetByArea.set(set.areaId, set);
      }
    }

    return {
      user,
      activePlans,
      currentQuestionSets: Array.from(currentQuestionSetByArea.values()),
      currentSnapshot,
      snapshotHistory,
      planHistory,
    };
  }

  async listProfessionals() {
    return this.prisma.user.findMany({
      where: { role: 'PROFESSIONAL' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        professionalAreaCompetences: {
          select: {
            areaId: true,
            area: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
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
      },
    });
  }

  async linkUserToProfessional(
    professionalId: string,
    userId: string,
    areaId: string,
  ) {
    if (!professionalId || !userId || !areaId) {
      throw new BadRequestException('Dati collegamento mancanti');
    }

    const [professional, user, competence] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: professionalId },
        select: { id: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      }),
      this.prisma.professionalAreaCompetence.findUnique({
        where: { professionalId_areaId: { professionalId, areaId } },
        select: { id: true },
      }),
    ]);

    if (!professional || professional.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException('Professionista non valido');
    }
    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Utente non valido');
    }
    if (!competence) {
      throw new BadRequestException(
        'Il professionista non e abilitato per questa area',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.professionalUserLink.deleteMany({
        where: {
          userId,
          areaId,
          professionalId: { not: professionalId },
        },
      });

      const link = await tx.professionalUserLink.upsert({
        where: {
          userId_areaId: {
            userId,
            areaId,
          },
        },
        update: { professionalId },
        create: {
          professionalId,
          userId,
          areaId,
        },
        select: {
          id: true,
          professionalId: true,
          userId: true,
          areaId: true,
          createdAt: true,
        },
      });

      await tx.questionSetAreaApproval.updateMany({
        where: {
          areaId,
          status: 'PENDING',
          professionalId: { not: professionalId },
          questionSet: {
            userId,
            status: 'PENDING_APPROVAL',
          },
        },
        data: {
          professionalId,
          approvedByProfessionalId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      return link;
    });
  }

  async assignCompetences(professionalId: string, areaIds: string[]) {
    if (!professionalId || !areaIds?.length) {
      throw new BadRequestException('Dati competenze mancanti');
    }

    const professional = await this.prisma.user.findUnique({
      where: { id: professionalId },
      select: { id: true, role: true },
    });
    if (!professional || professional.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException('Professionista non valido');
    }

    const areas = await this.prisma.area.findMany({
      where: { id: { in: areaIds } },
      select: { id: true },
    });
    if (areas.length !== areaIds.length) {
      throw new BadRequestException('ID area non validi');
    }

    const results = [] as Array<{ areaId: string }>;
    for (const areaId of areaIds) {
      const entry = await this.prisma.professionalAreaCompetence.upsert({
        where: {
          professionalId_areaId: {
            professionalId,
            areaId,
          },
        },
        update: {},
        create: {
          professionalId,
          areaId,
        },
        select: { areaId: true },
      });
      results.push(entry);
    }

    return { professionalId, areaIds: results.map((item) => item.areaId) };
  }

  async linkUserToCoach(
    coachId: string,
    userId: string,
    specializationId: string,
  ) {
    if (!coachId || !userId || !specializationId) {
      throw new BadRequestException('Dati collegamento allenatore mancanti');
    }

    const [coach, user, competence] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: coachId },
        select: { id: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      }),
      this.prisma.coachSpecializationCompetence.findUnique({
        where: { coachId_specializationId: { coachId, specializationId } },
        select: { id: true },
      }),
    ]);

    if (!coach || coach.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException('Allenatore non valido');
    }
    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Utente non valido');
    }
    if (!competence) {
      throw new BadRequestException(
        'L allenatore non e abilitato per questa specializzazione',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.coachUserLink.upsert({
        where: {
          userId_specializationId: {
            userId,
            specializationId,
          },
        },
        update: { coachId },
        create: {
          coachId,
          userId,
          specializationId,
        },
        select: {
          id: true,
          coachId: true,
          userId: true,
          specializationId: true,
          createdAt: true,
        },
      });

      await tx.trainingQuestionSetCoachApproval.updateMany({
        where: {
          status: 'PENDING',
          coachId: { not: coachId },
          questionSet: {
            userId,
            specializationId,
            status: 'PENDING_APPROVAL',
          },
        },
        data: {
          coachId,
          approvedByCoachId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      return link;
    });
  }

  async assignCoachCompetences(coachId: string, specializationIds: string[]) {
    if (!coachId || !specializationIds?.length) {
      throw new BadRequestException('Dati competenze allenatore mancanti');
    }

    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, role: true },
    });
    if (!coach || coach.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException('Allenatore non valido');
    }

    const specializations = await this.prisma.sportSpecialization.findMany({
      where: { id: { in: specializationIds } },
      select: { id: true },
    });
    if (specializations.length !== specializationIds.length) {
      throw new BadRequestException('ID specializzazione non validi');
    }

    const results = [] as Array<{ specializationId: string }>;
    for (const specializationId of specializationIds) {
      const entry = await this.prisma.coachSpecializationCompetence.upsert({
        where: {
          coachId_specializationId: {
            coachId,
            specializationId,
          },
        },
        update: {},
        create: {
          coachId,
          specializationId,
        },
        select: { specializationId: true },
      });
      results.push(entry);
    }

    return {
      coachId,
      specializationIds: results.map((item) => item.specializationId),
    };
  }

  async getProfessional(professionalId: string) {
    const professional = await this.prisma.user.findUnique({
      where: { id: professionalId },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (!professional || professional.role !== 'PROFESSIONAL') {
      throw new NotFoundException('Professionista non trovato');
    }

    const [
      competences,
      linkedUsers,
      pendingApprovals,
      approvalHistory,
      planItemHistory,
    ] = await Promise.all([
      this.prisma.professionalAreaCompetence.findMany({
        where: { professionalId },
        select: {
          areaId: true,
          area: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.professionalUserLink.findMany({
        where: { professionalId },
        select: {
          userId: true,
          user: { select: { id: true, email: true, role: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.questionSetAreaApproval.findMany({
        where: { professionalId, status: 'PENDING' },
        select: {
          id: true,
          status: true,
          areaId: true,
          questionSetId: true,
          questionSet: {
            select: { id: true, status: true, createdAt: true, userId: true },
          },
          area: { select: { id: true, name: true } },
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.questionSetAreaApproval.findMany({
        where: { professionalId, status: { in: ['APPROVED', 'REJECTED'] } },
        select: {
          id: true,
          status: true,
          areaId: true,
          questionSetId: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          questionSet: {
            select: { id: true, status: true, createdAt: true, userId: true },
          },
          area: { select: { id: true, name: true } },
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.planItem.findMany({
        where: {
          approvedByProfessionalId: professionalId,
        },
        select: {
          id: true,
          areaId: true,
          status: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          planRelease: { select: { id: true, userId: true } },
          area: { select: { id: true, name: true } },
        },
        orderBy: { id: 'desc' },
      }),
    ]);

    return {
      professional,
      competences,
      linkedUsers,
      pendingApprovals,
      approvalHistory,
      planItemHistory,
    };
  }
}
