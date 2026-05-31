import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { QuestionsService } from './questions.service';

const createService = (coachAccess: boolean) => {
  const questionHistory = [
    {
      id: 'question-set-1',
      userId: 'user-1',
      areaId: 'area-2',
      planReleaseId: 'plan-1',
      type: 'PERFORMANCE',
      status: 'CLOSED',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      questions: [],
    },
  ];

  const prisma = {
    questionSet: {
      findMany: jest.fn(() => questionHistory),
    },
  };
  const abac = {
    canAccessUser: jest.fn(() => true),
    canAccessUserArea: jest.fn(() => false),
    canCoachAccessUser: jest.fn(() => coachAccess),
  };

  return {
    service: new QuestionsService(prisma as never, abac as never, {} as never),
    abac,
    questionHistory,
  };
};

describe('QuestionsService coach history access', () => {
  it('allows an assigned coach to read any athlete area questionnaire history', async () => {
    const { service, abac, questionHistory } = createService(true);

    await expect(
      service.getQuestionSetHistory(
        { id: 'coach-1', role: UserRole.PROFESSIONAL },
        'user-1',
        'area-2',
      ),
    ).resolves.toEqual(questionHistory);

    expect(abac.canAccessUserArea).toHaveBeenCalledWith(
      'coach-1',
      'user-1',
      'area-2',
    );
    expect(abac.canCoachAccessUser).toHaveBeenCalledWith('coach-1', 'user-1');
  });

  it('keeps denying unrelated professionals without area or coach access', async () => {
    const { service } = createService(false);

    await expect(
      service.getQuestionSetHistory(
        { id: 'pro-2', role: UserRole.PROFESSIONAL },
        'user-1',
        'area-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
