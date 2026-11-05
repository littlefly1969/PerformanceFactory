import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Day = { day: string; started: bigint; pending: bigint; completed: bigint };

@Injectable()
export class RegistrationReportService {
  constructor(private readonly prisma: PrismaService) {}
  async report(days: number) {
    const rows = await this.prisma.$queryRaw<Day[]>`
      WITH bounds AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Rome')::date - (${days}::int - 1) AS first
      ), starts AS (
        SELECT e."anonymousId", MIN(e."occurredAt") AS first_start
        FROM "AnalyticsEvent" e, bounds b
        WHERE e.name = 'registration_started' AND e.origin = 'CLIENT'
          AND e."anonymousId" IS NOT NULL
          AND e."occurredAt" >= (b.first::timestamp AT TIME ZONE 'Europe/Rome' AT TIME ZONE 'UTC')
          AND e."occurredAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        GROUP BY e."anonymousId"
      ), cohort AS (
        SELECT (s.first_start AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date AS day,
          NOT EXISTS (
            SELECT 1 FROM "AnalyticsEvent" c
            WHERE c.name = 'registration_completed' AND c.origin = 'SERVER'
              AND c."userId" IS NOT NULL AND c."anonymousId" = s."anonymousId"
              AND c."occurredAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          ) AS pending
        FROM starts s
      ), started AS (
        SELECT day, COUNT(*) AS started, COUNT(*) FILTER (WHERE pending) AS pending
        FROM cohort GROUP BY day
      ), completed AS (
        SELECT ("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date AS day,
          COUNT(DISTINCT "userId") AS completed
        FROM "AnalyticsEvent", bounds b
        WHERE name = 'registration_completed' AND origin = 'SERVER' AND "userId" IS NOT NULL
          AND "occurredAt" >= (b.first::timestamp AT TIME ZONE 'Europe/Rome' AT TIME ZONE 'UTC')
          AND "occurredAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        GROUP BY day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
        COALESCE(s.started, 0)::bigint AS started,
        COALESCE(s.pending, 0)::bigint AS pending,
        COALESCE(c.completed, 0)::bigint AS completed
      FROM bounds b, generate_series(b.first, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Rome')::date, '1 day') d(day)
      LEFT JOIN started s ON s.day = d.day::date
      LEFT JOIN completed c ON c.day = d.day::date
      ORDER BY d.day DESC`;
    const daily = rows.map((r) => ({
      day: r.day,
      started: Number(r.started),
      pending: Number(r.pending),
      completed: Number(r.completed),
    }));
    return {
      days,
      timezone: 'Europe/Rome',
      generatedAt: new Date().toISOString(),
      daily,
      totals: daily.reduce(
        (sum, r) => ({
          started: sum.started + r.started,
          pending: sum.pending + r.pending,
          completed: sum.completed + r.completed,
        }),
        { started: 0, pending: 0, completed: 0 },
      ),
    };
  }
}
