import { ConflictException } from '@nestjs/common';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import type { OnboardingAnswer } from '../onboarding/onboarding-model';
import { PrismaService } from '../prisma/prisma.service';
import { loadOperationalTemplates } from './assessment-configuration';
import { assertProgramAllowed } from './calibration/calibration-config';
import { baselineValue, chosenOptions } from './choice-answers';

/**
 * Giorni e durata per il programma. Non sono più domande dell'assessment: si
 * compilano nel profilo (`profileJson`, chiave del ruolo operativo) oppure
 * arrivano dalle risposte del vecchio assessment. Se mancano il programma non
 * parte; il blocco prima del paywall resta il primo motivo mostrato.
 */
export async function programAvailability(
  prisma: PrismaService,
  userId: string,
  stored: Record<string, unknown>,
): Promise<OnboardingAnswer[]> {
  const [operational, assessment] = await Promise.all([
    loadOperationalTemplates(prisma),
    prisma.userOnboardingAssessment.findUnique({
      where: { userId },
      select: { profileJson: true },
    }),
  ]);
  const profile = (assessment?.profileJson ?? {}) as Record<
    string,
    { value?: unknown } | undefined
  >;
  const answers = operational.map((q) => {
    const options = normalizeOptions(q.optionsJson) as { value: unknown }[];
    const value = [stored[q.id], profile[q.key]?.value].find(
      (v) => chosenOptions(options, v, q.multiple) !== null,
    );
    return value === undefined
      ? null
      : { questionId: q.id, value: baselineValue(q, value) };
  });
  if (answers.every((a) => a !== null)) return answers;
  await assertProgramAllowed(prisma, userId);
  throw new ConflictException({
    code: 'AVAILABILITY_REQUIRED',
    message:
      'Prima del programma indica nel profilo quanti giorni e quanto tempo hai per allenarti.',
  });
}
