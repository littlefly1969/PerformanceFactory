import { Prisma } from '@prisma/client';
import { terminalTrainingStates } from './training-sessions';
const questions = {
  orderBy: { orderIndex: 'asc' as const },
  select: {
    id: true,
    text: true,
    options: {
      select: { id: true, label: true },
      orderBy: { score: 'asc' as const },
    },
  },
};
export async function dueCheckIn(db: Prisma.TransactionClient, userId: string) {
  const training = await db.trainingQuestionSet.findFirst({
    where: {
      userId,
      status: 'PUBLISHED',
      trainingPlanRelease: {
        status: 'ACTIVE',
        items: { some: {}, every: { status: { in: terminalTrainingStates } } },
      },
    },
    orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, questions },
  });
  if (training)
    return {
      id: training.id,
      kind: 'TRAINING' as const,
      title: 'Come è andato il tuo allenamento?',
      questions: training.questions,
    };
  const area = await db.questionSet.findFirst({
    where: {
      userId,
      status: 'PUBLISHED',
      planRelease: {
        status: 'ACTIVE',
        items: { some: {}, every: { status: 'COMPLETED' } },
      },
    },
    orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, area: { select: { name: true } }, questions },
  });
  return area
    ? {
        id: area.id,
        kind: 'AREA' as const,
        title: `Check-in · ${area.area.name}`,
        questions: area.questions,
      }
    : null;
}
