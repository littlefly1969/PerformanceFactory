import { BadRequestException } from '@nestjs/common';
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
