import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OCCUPYING_SEATS } from './free-lesson-rules';

type Db = PrismaService | Prisma.TransactionClient;

/** Giorni di calendario mostrati all'atleta per scegliere la lezione. */
export const SLOT_DAYS = 21;

/**
 * Lezioni in calendario con posti liberi nei circoli che le offrono:
 * l'atleta indica giorno e orario preferiti, il gruppo lo compone l'admin.
 */
export async function lessonSlots(db: Db, now = new Date()) {
  const lessons = await db.freeLesson.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: {
        gt: now,
        lt: new Date(now.getTime() + SLOT_DAYS * 24 * 60 * 60 * 1000),
      },
      partner: { isActive: true, freeLessonsEnabled: true },
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      partnerId: true,
      startsAt: true,
      durationMinutes: true,
      capacity: true,
      _count: {
        select: { seats: { where: { status: { in: OCCUPYING_SEATS } } } },
      },
    },
  });
  return lessons
    .map(({ _count, capacity, ...lesson }) => ({
      ...lesson,
      seatsLeft: Math.max(0, capacity - _count.seats),
    }))
    .filter((lesson) => lesson.seatsLeft > 0);
}

/** La lezione preferita è in calendario, nel circolo scelto e ha posto. */
export async function checkPreferredLesson(
  db: Db,
  lessonId: string | undefined,
  partnerId: string,
  now = new Date(),
) {
  if (!lessonId) return null;
  const slot = (await lessonSlots(db, now)).find((s) => s.id === lessonId);
  if (!slot || slot.partnerId !== partnerId)
    throw new BadRequestException('Giorno e orario non più disponibili');
  return lessonId;
}
