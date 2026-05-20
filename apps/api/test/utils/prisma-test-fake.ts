import { PrismaService } from '../../src/prisma/prisma.service';

type DelegateMap = Record<string, unknown>;

export function createPrismaTestFake<TDelegates extends DelegateMap>(
  delegates: TDelegates,
): TDelegates & PrismaService {
  const fake: DelegateMap = { ...delegates };

  fake.$transaction = async (input: unknown) => {
    if (typeof input === 'function') {
      return (input as (tx: PrismaService) => unknown)(
        fake as unknown as PrismaService,
      );
    }

    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    throw new Error('Unsupported Prisma $transaction input in test fake');
  };

  return fake as TDelegates & PrismaService;
}

export type ProfessionalUserLinkTestRecord = {
  professionalId: string;
  userId: string;
  areaId?: string | null;
};

export function createProfessionalUserLinkDelegate(
  records: ProfessionalUserLinkTestRecord[],
) {
  const matches = (
    record: ProfessionalUserLinkTestRecord,
    where: Partial<ProfessionalUserLinkTestRecord> = {},
  ) => {
    if (
      where.professionalId &&
      record.professionalId !== where.professionalId
    ) {
      return false;
    }
    if (where.userId && record.userId !== where.userId) {
      return false;
    }
    if (where.areaId && record.areaId !== where.areaId) {
      return false;
    }
    return true;
  };

  return {
    findMany: ({
      where,
    }: {
      where?: Partial<ProfessionalUserLinkTestRecord>;
    } = {}) => records.filter((record) => matches(record, where)),
    findFirst: ({
      where,
    }: {
      where?: Partial<ProfessionalUserLinkTestRecord>;
    } = {}) => records.find((record) => matches(record, where)) ?? null,
  };
}

export type CoachUserLinkTestRecord = {
  coachId: string;
  userId: string;
  specializationId?: string | null;
};

export function createCoachUserLinkDelegate(
  records: CoachUserLinkTestRecord[] = [],
) {
  const matches = (
    record: CoachUserLinkTestRecord,
    where: Partial<CoachUserLinkTestRecord> = {},
  ) => {
    if (where.coachId && record.coachId !== where.coachId) {
      return false;
    }
    if (where.userId && record.userId !== where.userId) {
      return false;
    }
    if (
      where.specializationId &&
      record.specializationId !== where.specializationId
    ) {
      return false;
    }
    return true;
  };

  return {
    findMany: ({
      where,
    }: {
      where?: Partial<CoachUserLinkTestRecord>;
    } = {}) => records.filter((record) => matches(record, where)),
    findFirst: ({
      where,
    }: {
      where?: Partial<CoachUserLinkTestRecord>;
    } = {}) => records.find((record) => matches(record, where)) ?? null,
    findUnique: ({
      where,
    }: {
      where: {
        userId_specializationId?: {
          userId: string;
          specializationId: string;
        };
      };
    }) => {
      const key = where.userId_specializationId;
      if (!key) {
        return null;
      }
      return (
        records.find(
          (record) =>
            record.userId === key.userId &&
            record.specializationId === key.specializationId,
        ) ?? null
      );
    },
  };
}
