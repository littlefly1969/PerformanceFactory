import { performanceDriverName } from '../performance/performance-display';
import { Prisma } from '@prisma/client';
import { athleteDate, presentationStatus } from './training-sessions';

export const sessionInclude = {
  trainingPlanItem: {
    select: { title: true, type: true, body: true, metadata: true },
  },
  trainingPlanRelease: { select: { status: true, summaryText: true } },
} satisfies Prisma.TrainingSessionInclude;
type Session = Prisma.TrainingSessionGetPayload<{
  include: typeof sessionInclude;
}>;
/** Only present useful, stored metadata; never leak provider/prompt internals. */
export function sessionDetails(metadata: Prisma.JsonValue | null) {
  const details: { label: string; value: string }[] = [];
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    for (const [key, label] of [
      ['durationMinutes', 'Minuti'],
      ['equipment', 'Attrezzatura'],
      ['sets', 'Serie'],
      ['reps', 'Ripetizioni'],
      ['restSeconds', 'Recupero (secondi)'],
    ]) {
      const value = metadata[key];
      if (typeof value === 'string' || typeof value === 'number')
        details.push({ label, value: String(value) });
    }
  }
  return details;
}
export function sessionView(s: Session, today = athleteDate()) {
  const date = s.scheduledDate.toISOString().slice(0, 10);
  const details = sessionDetails(s.trainingPlanItem.metadata);
  return {
    track: 'SPORT' as const,
    areaName: null as string | null,
    id: s.id,
    date,
    sequence: s.sequence,
    status: s.status,
    displayStatus: presentationStatus(s.status, date, today),
    title: s.trainingPlanItem.title,
    type: s.trainingPlanItem.type,
    body: s.trainingPlanItem.body,
    details,
    summary: s.trainingPlanRelease.summaryText,
    canAct:
      s.status === 'SCHEDULED' && s.trainingPlanRelease.status === 'ACTIVE',
    completedAt: s.completedAt,
    skippedAt: s.skippedAt,
    completionNotes: s.completionNotes,
    completionRating: s.completionRating,
  };
}
export const areaSessionInclude = {
  planItem: {
    select: { title: true, type: true, body: true, metadata: true },
  },
  planRelease: {
    select: {
      status: true,
      aiContextSummaries: {
        select: { summaryText: true },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
  },
  area: { select: { name: true } },
} satisfies Prisma.AreaSessionInclude;
type AreaSessionRecord = Prisma.AreaSessionGetPayload<{
  include: typeof areaSessionInclude;
}>;
/** Stessa forma della sessione sportiva: il calendario unisce le due tracce. */
export function areaSessionView(s: AreaSessionRecord, today = athleteDate()) {
  const date = s.scheduledDate.toISOString().slice(0, 10);
  return {
    track: 'AREA' as const,
    areaName: s.area.name as string | null,
    id: s.id,
    date,
    sequence: s.sequence,
    status: s.status,
    displayStatus: presentationStatus(s.status, date, today),
    title: s.planItem.title,
    type: s.planItem.type,
    body: s.planItem.body,
    details: sessionDetails(s.planItem.metadata),
    summary: s.planRelease.aiContextSummaries[0]?.summaryText ?? '',
    canAct: s.status === 'SCHEDULED' && s.planRelease.status === 'ACTIVE',
    completedAt: s.completedAt,
    skippedAt: s.skippedAt,
    completionNotes: s.completionNotes,
    completionRating: s.completionRating,
  };
}
export const snapshotInclude = {
  areas: {
    include: { area: { select: { name: true } } },
    orderBy: { areaId: 'asc' as const },
  },
} satisfies Prisma.PerformanceProfileSnapshotInclude;
type Snapshot = Prisma.PerformanceProfileSnapshotGetPayload<{
  include: typeof snapshotInclude;
}>;
export function performanceView(
  snapshot: Snapshot | null,
  orderedAreaIds: string[] = [],
) {
  if (!snapshot) return null;
  const drivers = snapshot.areas.map((a) => ({
    id: a.areaId,
    name: performanceDriverName(a.area.name),
    current: a.realR,
    potential: a.potentialP,
    gap: a.potentialP - a.realR,
  }));
  drivers.sort((a, b) => {
    const position = (id: string) => {
      const index = orderedAreaIds.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return (
      position(a.id) - position(b.id) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
  const potential = drivers.length
    ? Math.round(
        drivers.reduce((sum, d) => sum + d.potential, 0) / drivers.length,
      )
    : null;
  return {
    snapshotId: snapshot.id,
    date: snapshot.createdAt,
    current: snapshot.rankingGlobal,
    potential,
    gap: potential === null ? null : potential - snapshot.rankingGlobal,
    drivers,
  };
}
export function completedStreak(dates: Date[], today = athleteDate()) {
  const days = new Set(dates.map((d) => athleteDate(d)));
  let cursor = new Date(`${today}T00:00:00Z`),
    count = 0;
  if (!days.has(today)) cursor = new Date(cursor.getTime() - 86400000);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return count;
}
