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
  trainingDuringCalibration: true,
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
 * Il programma (baseline e piano) resta chiuso finché la calibrazione è aperta,
 * salvo che il back office abbia attivato gli allenamenti nella fase gratuita.
 * Gli atleti senza valutazione AI seguono ancora il flusso precedente.
 */
export async function assertTrainingAllowed(
  prisma: Pick<PrismaService, 'calibrationConfig' | 'assessmentEvaluation'>,
  userId: string,
) {
  const [evaluation, settings] = await Promise.all([
    prisma.assessmentEvaluation.findFirst({
      where: { userId },
      select: {
        user: { select: { calibration: { select: { status: true } } } },
      },
    }),
    loadCalibrationSettings(prisma),
  ]);
  if (!evaluation || settings.trainingDuringCalibration) return;
  if (evaluation.user.calibration?.status === 'CALIBRATION_COMPLETED') return;
  throw new ConflictException({
    code: 'CALIBRATION_IN_PROGRESS',
    message:
      'Il programma si sblocca a calibrazione completata. Continua a rispondere ai round.',
  });
}
