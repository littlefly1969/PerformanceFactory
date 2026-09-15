import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export async function listUsers(prisma: PrismaService) {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function createUser(
  prisma: PrismaService,
  email: string,
  password: string,
  role: UserRole,
) {
  if (!email || !password || !role) {
    throw new BadRequestException('Dati utente mancanti');
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new BadRequestException('Utente gia esistente');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
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

export async function getUser(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({
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
    prisma.improvementPlanRelease.findMany({
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
    prisma.questionSet.findMany({
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
    prisma.performanceProfileSnapshot.findFirst({
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
    prisma.performanceProfileSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rankingGlobal: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.improvementPlanRelease.findMany({
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
