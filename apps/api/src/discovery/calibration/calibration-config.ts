import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CalibrationSettings,
  DEFAULT_CALIBRATION_SETTINGS,
  settingsProblems,
} from './calibration-rules';

const ID = 'default';
const select = {
  confidenceThreshold: true,
  levelConfidenceThreshold: true,
  maxDays: true,
  closingDay: true,
  questionsPerDriver: true,
  driversPerRound: true,
  minHoursBetweenRounds: true,
  programBeforePaywall: true,
} as const;

/** Parametri correnti; la riga nasce con i valori di default alla prima lettura. */
export async function loadCalibrationSettings(
  prisma: Pick<PrismaService, 'calibrationConfig'>,
): Promise<CalibrationSettings> {
  return prisma.calibrationConfig.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID, ...DEFAULT_CALIBRATION_SETTINGS },
    select,
  });
}

export async function updateCalibrationSettings(
  prisma: PrismaService,
  change: Partial<CalibrationSettings>,
  actorId: string,
) {
  const next = { ...(await loadCalibrationSettings(prisma)), ...change };
  const problems = settingsProblems(next);
  if (problems.length) throw new BadRequestException(problems.join('. '));
  return prisma.calibrationConfig.update({
    where: { id: ID },
    data: { ...change, updatedById: actorId },
    select,
  });
}

/**
 * Chi è entrato in calibrazione non ottiene il programma (baseline e piano) dal
 * flusso precedente, nemmeno a calibrazione completata: la sequenza è
 * calibrazione → P3/P6/P12 → Program Horizon → paywall (slice successive).
 * Il back office può riaprirlo (decisione 13). Gli atleti senza valutazione AI
 * seguono ancora il flusso precedente finché non arriva il paywall (gap 1.10).
 */
export async function assertProgramAllowed(
  prisma: Pick<PrismaService, 'calibrationConfig' | 'assessmentEvaluation'>,
  userId: string,
) {
  const [evaluation, settings] = await Promise.all([
    prisma.assessmentEvaluation.findFirst({
      where: { userId },
      select: { id: true },
    }),
    loadCalibrationSettings(prisma),
  ]);
  if (!evaluation || settings.programBeforePaywall) return;
  throw new ConflictException({
    code: 'PROGRAM_LOCKED_BEFORE_PAYWALL',
    message:
      'Il programma si sblocca dopo la scelta del percorso e l’abbonamento.',
  });
}
