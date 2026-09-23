import { BadRequestException } from '@nestjs/common';
import {
  TrainingConstraints,
  TrainingSessionProposal,
  TrainingWindow,
} from './proposal-provider-model';
import { athleteDate, dateOnly } from '../athlete/training-sessions';
export function trainingWindow(
  previousEndsOn: Date | null | undefined,
  rollingIndex: number,
  programWeeks: number,
  now = new Date(),
): TrainingWindow {
  const today = dateOnly(athleteDate(now));
  const next = previousEndsOn
    ? new Date(previousEndsOn.getTime() + 86400000)
    : today;
  const start = next > today ? next : today;
  const windowsPerProgram = programWeeks / 2;
  return {
    startsOn: start.toISOString().slice(0, 10),
    endsOn: new Date(start.getTime() + 13 * 86400000)
      .toISOString()
      .slice(0, 10),
    windowDays: 14,
    macroBlock: Math.floor((rollingIndex - 1) / windowsPerProgram) + 1,
    windowInProgram: ((rollingIndex - 1) % windowsPerProgram) + 1,
    windowsPerProgram,
  };
}
export function validateTrainingSchedule(
  proposal: { sessionsPerWeek: number; planItems: TrainingSessionProposal[] },
  constraints: TrainingConstraints,
  startsOn: string,
) {
  const invalid = (reason: string): never => {
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: `Calendario AI non valido: ${reason}`,
    });
  };
  if (!Array.isArray(proposal.planItems)) invalid('sessioni mancanti');
  const counts = [0, 0],
    days = new Set<number>();
  const start = dateOnly(startsOn);
  for (const session of proposal.planItems) {
    if (
      !session ||
      !['type', 'title', 'body'].every(
        (key) =>
          typeof session[key as 'type'] === 'string' &&
          session[key as 'type'].trim(),
      )
    )
      invalid('contenuto sessione mancante');
    const offset = session.dayOffset;
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= constraints.operationalWindowDays ||
      days.has(offset)
    )
      invalid('giorno fuori finestra o duplicato');
    if (
      !Number.isInteger(session.durationMinutes) ||
      session.durationMinutes <= 0 ||
      session.durationMinutes > constraints.availability.sessionDurationMinutes
    )
      invalid('durata oltre la disponibilità');
    if (
      session.sets != null &&
      (!Number.isInteger(session.sets) || session.sets < 1)
    )
      invalid('serie non valide');
    if (
      session.restSeconds != null &&
      (!Number.isInteger(session.restSeconds) || session.restSeconds < 0)
    )
      invalid('recupero non valido');
    for (const key of ['equipment', 'reps'] as const)
      if (session[key] != null && typeof session[key] !== 'string')
        invalid('dettagli non validi');
    const date = new Date(start.getTime() + offset * 86400000);
    const weekday = date.getUTCDay() || 7;
    if (
      constraints.availability.preferredDays?.length &&
      !constraints.availability.preferredDays.includes(weekday)
    )
      invalid('giorno non disponibile');
    counts[Math.floor(offset / 7)]++;
    days.add(offset);
  }
  const { minSessionsPerWeek: min, maxSessionsPerWeek: max } =
    constraints.prescription;
  if (
    counts.some(
      (count) =>
        count < min ||
        count > max ||
        count > constraints.availability.daysPerWeek,
    )
  )
    invalid('frequenza fuori dai vincoli');
  for (let start = 0; start <= 7; start++) {
    if ([...days].filter((day) => day >= start && day < start + 7).length > max)
      invalid('troppe sessioni in sette giorni consecutivi');
  }
  // This summary is the maximum weekly count; the two weeks may differ (e.g. 3 + 4).
  if (
    !Number.isInteger(proposal.sessionsPerWeek) ||
    proposal.sessionsPerWeek !== Math.max(...counts)
  )
    invalid('riepilogo frequenza incoerente');
}
