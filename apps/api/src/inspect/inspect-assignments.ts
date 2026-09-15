import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function linkUserToProfessional(
  prisma: PrismaService,
  professionalId: string,
  userId: string,
  areaId: string,
) {
  if (!professionalId || !userId || !areaId) {
    throw new BadRequestException('Dati collegamento mancanti');
  }

  const [professional, user, competence] = await Promise.all([
    prisma.user.findUnique({
      where: { id: professionalId },
      select: { id: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
    prisma.professionalAreaCompetence.findUnique({
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

  return prisma.$transaction(async (tx) => {
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

export async function assignCompetences(
  prisma: PrismaService,
  professionalId: string,
  areaIds: string[],
) {
  if (!professionalId || !areaIds?.length) {
    throw new BadRequestException('Dati competenze mancanti');
  }

  const professional = await prisma.user.findUnique({
    where: { id: professionalId },
    select: { id: true, role: true },
  });
  if (!professional || professional.role !== UserRole.PROFESSIONAL) {
    throw new BadRequestException('Professionista non valido');
  }

  const areas = await prisma.area.findMany({
    where: { id: { in: areaIds } },
    select: { id: true },
  });
  if (areas.length !== areaIds.length) {
    throw new BadRequestException('ID area non validi');
  }

  const results = [] as Array<{ areaId: string }>;
  for (const areaId of areaIds) {
    const entry = await prisma.professionalAreaCompetence.upsert({
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

export async function linkUserToCoach(
  prisma: PrismaService,
  coachId: string,
  userId: string,
  specializationId: string,
) {
  if (!coachId || !userId || !specializationId) {
    throw new BadRequestException('Dati collegamento allenatore mancanti');
  }

  const [coach, user, competence] = await Promise.all([
    prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
    prisma.coachSpecializationCompetence.findUnique({
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

  return prisma.$transaction(async (tx) => {
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

export async function assignCoachCompetences(
  prisma: PrismaService,
  coachId: string,
  specializationIds: string[],
) {
  if (!coachId || !specializationIds?.length) {
    throw new BadRequestException('Dati competenze allenatore mancanti');
  }

  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { id: true, role: true },
  });
  if (!coach || coach.role !== UserRole.PROFESSIONAL) {
    throw new BadRequestException('Allenatore non valido');
  }

  const specializations = await prisma.sportSpecialization.findMany({
    where: { id: { in: specializationIds } },
    select: { id: true },
  });
  if (specializations.length !== specializationIds.length) {
    throw new BadRequestException('ID specializzazione non validi');
  }

  const results = [] as Array<{ specializationId: string }>;
  for (const specializationId of specializationIds) {
    const entry = await prisma.coachSpecializationCompetence.upsert({
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
