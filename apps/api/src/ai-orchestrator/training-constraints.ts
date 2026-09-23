import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleError } from '../training-lifecycle/training-lifecycle.policy';
import { TrainingConstraints } from './proposal-provider-model';

export function profileValue(profile: unknown, key: string): unknown {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return undefined;
  const value = (profile as Record<string, unknown>)[key];
  return value && typeof value === 'object' && 'value' in value
    ? value.value
    : value;
}
export function trainingFrequency(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const frequencies: Record<string, { min: number; max: number }> = {
    '0_1': { min: 0, max: 1 },
    '2_3': { min: 2, max: 3 },
    '4_5': { min: 4, max: 5 },
    '6_PLUS': { min: 6, max: 7 },
  };
  if (frequencies[raw]) return frequencies[raw];
  const range = raw.match(/^(\d)[_–-](\d)/);
  if (range && Number(range[1]) <= Number(range[2]) && Number(range[2]) <= 7)
    return { min: Number(range[1]), max: Number(range[2]) };
  if (/^6\+/.test(raw)) return { min: 6, max: 7 };
  if (/^5 (O PIÙ|O PIU)/.test(raw)) return { min: 5, max: 7 };
  throw new LifecycleError('TRAINING_AVAILABILITY_REQUIRED');
}
export function trainingAvailability(profile: unknown) {
  const currentFrequency = trainingFrequency(
    profileValue(profile, 'general_training_frequency') ??
      profileValue(profile, 'pf4_frequency'),
  );
  const daysPerWeek = Number(profileValue(profile, 'training_days_available'));
  const sessionDurationMinutes = Number(
    profileValue(profile, 'training_session_duration'),
  );
  if (
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < 1 ||
    daysPerWeek > 7 ||
    ![30, 45, 60, 90, 120].includes(sessionDurationMinutes)
  )
    throw new LifecycleError('TRAINING_AVAILABILITY_REQUIRED');
  const rawDays = profileValue(profile, 'preferred_training_days');
  const preferredDays = Array.isArray(rawDays)
    ? [...new Set(rawDays.map(Number))]
        .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        .sort()
    : undefined;
  return {
    currentFrequency,
    availability: {
      daysPerWeek,
      sessionDurationMinutes,
      ...(preferredDays?.length ? { preferredDays } : {}),
    },
  };
}
export function prescriptionRange(
  frequency: { min: number; max: number },
  available: number,
  previous?: {
    planned: number;
    completed: number;
    ratings: number[];
    checkInScores: number[];
  },
) {
  let limit = frequency.max + 1;
  if (previous?.planned) {
    const weekly = Math.ceil(previous.planned / 2);
    const adherence = previous.completed / previous.planned;
    const average = (values: number[]) =>
      values.reduce((a, b) => a + b, 0) / values.length;
    const difficult =
      (previous.ratings.length > 0 && average(previous.ratings) <= 2) ||
      (previous.checkInScores.length > 0 &&
        average(previous.checkInScores) < 50);
    limit =
      adherence < 0.75
        ? Math.max(1, Math.ceil(previous.completed / 2))
        : difficult
          ? Math.max(1, weekly - 1)
          : weekly + 1;
  }
  const maxSessionsPerWeek = Math.max(1, Math.min(available, limit, 7));
  return {
    minSessionsPerWeek: Math.min(
      Math.max(1, frequency.min),
      maxSessionsPerWeek,
    ),
    maxSessionsPerWeek,
  };
}
@Injectable()
export class TrainingConstraintsService {
  constructor(private readonly prisma: PrismaService) {}
  async build(
    userId: string,
    previousReleaseId?: string,
  ): Promise<TrainingConstraints> {
    const [assessment, discovery, previous] = await Promise.all([
      this.prisma.userOnboardingAssessment.findUnique({ where: { userId } }),
      this.prisma.athleteDiscovery.findUnique({
        where: { userId },
        select: { programDurationWeeks: true },
      }),
      previousReleaseId
        ? this.prisma.trainingPlanRelease.findFirst({
            where: { id: previousReleaseId, userId },
            include: {
              sessions: true,
              questionSets: {
                include: { questions: { include: { answers: true } } },
              },
            },
          })
        : null,
    ]);
    const programDurationWeeks =
      discovery?.programDurationWeeks ??
      Number(profileValue(assessment?.profileJson, 'program_duration_weeks'));
    if (
      programDurationWeeks !== 4 &&
      programDurationWeeks !== 12 &&
      programDurationWeeks !== 52
    )
      throw new LifecycleError('TRAINING_PROGRAM_REQUIRED');
    const { currentFrequency, availability } = trainingAvailability(
      assessment?.profileJson,
    );
    const available = Math.min(
      availability.daysPerWeek,
      availability.preferredDays?.length ?? 7,
    );
    const previousWork =
      previous?.startsOn && previous.sessions.length
        ? {
            planned: previous.sessions.length,
            completed: previous.sessions.filter((s) => s.status === 'COMPLETED')
              .length,
            ratings: previous.sessions.flatMap((s) =>
              s.completionRating === null ? [] : [s.completionRating],
            ),
            checkInScores: previous.questionSets.flatMap((qs) =>
              qs.questions.flatMap((q) => q.answers.map((a) => a.scoreAwarded)),
            ),
          }
        : undefined;
    return {
      programDurationWeeks,
      operationalWindowDays: 14,
      currentFrequency,
      availability,
      prescription: prescriptionRange(
        currentFrequency,
        available,
        previousWork,
      ),
    };
  }
}
