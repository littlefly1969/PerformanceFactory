import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PlansService } from './plans.service';

const createService = (coachAccess: boolean) => {
  const planHistory = [
    {
      id: 'plan-1',
      userId: 'user-1',
      areaId: 'area-2',
      version: 1,
      status: 'ACTIVE',
      generatedBy: 'AI',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      sourceSnapshotId: 'snapshot-1',
      items: [],
    },
  ];

  const prisma = {
    improvementPlanRelease: {
      findMany: jest.fn(() => planHistory),
    },
  };
  const abac = {
    canAccessUser: jest.fn(() => true),
    canAccessUserArea: jest.fn(() => false),
    canCoachAccessUser: jest.fn(() => coachAccess),
  };

  return {
    service: new PlansService(prisma as never, abac as never, {} as never),
    abac,
    prisma,
    planHistory,
  };
};

describe('PlansService coach history access', () => {
  it('allows an assigned coach to read any athlete area history', async () => {
    const { service, abac, planHistory } = createService(true);

    await expect(
      service.getPlanHistory(
        { id: 'coach-1', role: UserRole.PROFESSIONAL },
        'user-1',
        'area-2',
      ),
    ).resolves.toEqual(planHistory);

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
      service.getPlanHistory(
        { id: 'pro-2', role: UserRole.PROFESSIONAL },
        'user-1',
        'area-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
