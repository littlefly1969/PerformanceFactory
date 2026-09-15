import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function listProfessionals(prisma: PrismaService) {
  return prisma.user.findMany({
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

export async function getProfessional(
  prisma: PrismaService,
  professionalId: string,
) {
  const professional = await prisma.user.findUnique({
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
    prisma.professionalAreaCompetence.findMany({
      where: { professionalId },
      select: {
        areaId: true,
        area: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.professionalUserLink.findMany({
      where: { professionalId },
      select: {
        userId: true,
        user: { select: { id: true, email: true, role: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.questionSetAreaApproval.findMany({
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
    prisma.questionSetAreaApproval.findMany({
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
    prisma.planItem.findMany({
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
