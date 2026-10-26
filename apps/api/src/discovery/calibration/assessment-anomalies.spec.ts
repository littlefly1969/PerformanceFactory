import { PrismaService } from '../../prisma/prisma.service';
import { listAnomalies } from './assessment-anomalies';

type Row = { id: string; status: string; createdAt: Date };

/** findMany in memoria: filtro per stato, ordine per data, limite. */
function fakePrisma(rows: Row[]) {
  const findMany = jest.fn(
    ({
      where,
      take,
    }: {
      where: { status?: string | { not: string } };
      take: number;
    }) => {
      const matches = (status: string) =>
        typeof where.status === 'string'
          ? status === where.status
          : where.status
            ? status !== where.status.not
            : true;
      return Promise.resolve(
        rows
          .filter((r) => matches(r.status))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)
          .map((r) => ({
            ...r,
            userId: `user-${r.id}`,
            user: { email: 'a@example.test', firstName: 'A', lastName: null },
            evaluation: null,
            reviewedBy: null,
          })),
      );
    },
  );
  return { assessmentAnomaly: { findMany } } as unknown as PrismaService;
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));

describe('listAnomalies', () => {
  it('keeps an older OPEN anomaly visible behind 200 newer archived ones', async () => {
    const rows: Row[] = [
      { id: 'open', status: 'OPEN', createdAt: at(0) },
      ...Array.from({ length: 200 }, (_, i) => ({
        id: `archived-${i}`,
        status: 'ARCHIVED',
        createdAt: at(i + 1),
      })),
    ];
    const queue = await listAnomalies(fakePrisma(rows));
    expect(queue[0]).toMatchObject({ id: 'open', status: 'OPEN' });
    expect(queue).toHaveLength(200);
  });

  it('still filters by the requested status', async () => {
    const rows: Row[] = [
      { id: 'open', status: 'OPEN', createdAt: at(0) },
      { id: 'reviewed', status: 'REVIEWED', createdAt: at(1) },
    ];
    expect(
      (await listAnomalies(fakePrisma(rows), 'REVIEWED')).map((a) => a.id),
    ).toEqual(['reviewed']);
    expect(
      (await listAnomalies(fakePrisma(rows), 'OPEN')).map((a) => a.id),
    ).toEqual(['open']);
  });
});
