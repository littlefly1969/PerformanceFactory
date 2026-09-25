import { ConflictException, Logger } from '@nestjs/common';
import {
  OnboardingQuestionScope,
  OnboardingQuestionTemplate,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRecord } from '../onboarding/onboarding-model';
import {
  loadEnabledDriverAreasForSelection,
  requireSportContext,
} from '../onboarding/onboarding-sports';

/** Domande per driver attivo: un numero esatto, non un minimo. */
export const EXPECTED_AREA_QUESTIONS = 2;

/**
 * Domande operative: ruolo applicativo e chiave di profilo letta da
 * TrainingConstraintsService. Alimentano i vincoli di allenamento, mai il
 * Performance Index.
 */
export const OPERATIONAL_ROLES = {
  TRAINING_AVAILABILITY_DAYS: 'training_days_available',
  TRAINING_SESSION_DURATION: 'training_session_duration',
} as const;
export type OperationalRole = keyof typeof OPERATIONAL_ROLES;

type Metadata = {
  semanticRole?: string;
  sportKey?: string;
  options?: unknown;
};
const metadata = (json: Prisma.JsonValue): Metadata =>
  json && typeof json === 'object' && !Array.isArray(json)
    ? (json as Metadata)
    : {};
export const semanticRoleOf = (template: {
  optionsJson: Prisma.JsonValue;
}): OperationalRole | undefined => {
  const role = metadata(template.optionsJson).semanticRole;
  return role && role in OPERATIONAL_ROLES
    ? (role as OperationalRole)
    : undefined;
};
export const areaOptionsOf = (template: { optionsJson: Prisma.JsonValue }) => {
  const options = metadata(template.optionsJson).options;
  return Array.isArray(options)
    ? (options as { value?: unknown; label?: unknown; score?: unknown }[])
    : [];
};

const logger = new Logger('AssessmentConfiguration');

export function logAssessmentProblems(problems: string[]) {
  logger.error(`ASSESSMENT_CONFIGURATION_INVALID ${problems.join('; ')}`);
}

/** Errore controllato: l'atleta vede un messaggio neutro, il log il dettaglio. */
export function assessmentConfigurationError(problems: string[]) {
  logAssessmentProblems(problems);
  return new ConflictException({
    code: 'ASSESSMENT_CONFIGURATION_INVALID',
    message: 'Il questionario non è ancora disponibile. Riprova più tardi.',
  });
}

export const estimatedMinutes = (count: number) =>
  Math.max(1, Math.ceil(count / 3));

function operationalRecord(t: OnboardingQuestionTemplate): TemplateRecord {
  return {
    id: t.id,
    // La chiave e quella semantica, non il testo: il training la legge cosi.
    key: OPERATIONAL_ROLES[semanticRoleOf(t)!],
    scope: OnboardingQuestionScope.GENERAL,
    areaId: null,
    label: t.label,
    helpText: t.helpText,
    inputType: t.inputType,
    optionsJson: areaOptionsOf(t) as Prisma.JsonValue,
    required: true,
    orderIndex: t.orderIndex,
    area: null,
  };
}

/** Domande operative attive, nell'ordine della loro sezione. */
export async function loadOperationalTemplates(
  prisma: Pick<PrismaService, 'onboardingQuestionTemplate'>,
) {
  const rows = await prisma.onboardingQuestionTemplate.findMany({
    where: { scope: OnboardingQuestionScope.GENERAL, isActive: true },
    orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
  });
  return rows.filter((t) => semanticRoleOf(t)).map(operationalRecord);
}

/**
 * Problemi che impediscono di pubblicare l'assessment. Nessuna correzione
 * silenziosa: niente domande mancanti colmate dall'AI, niente domande in eccesso
 * ignorate.
 */
export function assessmentProblems(
  operational: TemplateRecord[],
  areas: { id: string; name: string }[],
  areaTemplates: OnboardingQuestionTemplate[],
) {
  const problems: string[] = [];
  for (const [role, key] of Object.entries(OPERATIONAL_ROLES)) {
    const found = operational.filter((q) => q.key === key).length;
    if (found !== 1)
      problems.push(
        `Domanda operativa ${role}: expected 1 active question, found ${found}`,
      );
  }
  for (const area of areas) {
    const templates = areaTemplates.filter((t) => t.areaId === area.id);
    if (templates.length !== EXPECTED_AREA_QUESTIONS)
      problems.push(
        `Area "${area.name}": expected ${EXPECTED_AREA_QUESTIONS} active questions, found ${templates.length}`,
      );
    for (const t of templates) {
      const options = areaOptionsOf(t);
      // Senza punteggio la risposta non contribuirebbe al realR del driver.
      if (
        !options.length ||
        options.some((o) => !Number.isFinite(Number(o.score)))
      )
        problems.push(
          `Area "${area.name}": question "${t.label}" needs options with a score`,
        );
    }
  }
  return problems;
}

/** Sequenza, conteggi e problemi per uno sport e i suoi driver attivi. */
export async function buildAssessmentConfiguration(
  prisma: PrismaService,
  sportKey: string,
  drivers: { id: string; name: string }[],
) {
  const [operational, areaTemplates] = await Promise.all([
    loadOperationalTemplates(prisma),
    prisma.onboardingQuestionTemplate.findMany({
      where: {
        scope: OnboardingQuestionScope.AREA,
        isActive: true,
        areaId: { in: drivers.map((a) => a.id) },
        optionsJson: { path: ['sportKey'], equals: sportKey },
      },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    }),
  ]);
  // Driver nell'ordine configurato: quello della loro prima domanda.
  const first = (id: string) =>
    areaTemplates.find((t) => t.areaId === id)?.orderIndex ??
    Number.MAX_SAFE_INTEGER;
  const areas = [...drivers]
    .sort((a, b) => first(a.id) - first(b.id))
    .map((area) => ({
      ...area,
      templates: areaTemplates.filter((t) => t.areaId === area.id),
    }));
  const areaQuestionCount = areaTemplates.length;
  const count = operational.length + areaQuestionCount;
  return {
    sportKey,
    operational,
    areas,
    problems: assessmentProblems(operational, drivers, areaTemplates),
    fixedQuestionCount: operational.length,
    areaQuestionCount,
    count,
    estimatedMinutes: estimatedMinutes(count),
  };
}
export type AssessmentConfiguration = Awaited<
  ReturnType<typeof buildAssessmentConfiguration>
>;

export async function loadAssessmentConfiguration(
  prisma: PrismaService,
  userId: string,
) {
  const { selection, areas } = await requireSportContext(prisma, userId);
  return buildAssessmentConfiguration(prisma, selection.sportKey, areas);
}

/** Configurazione della specializzazione PF4 corrente, per l'editor admin. */
export async function loadPf4AssessmentConfiguration(prisma: PrismaService) {
  const specialization = await prisma.sportSpecialization.findFirst({
    where: {
      key: {
        equals: process.env.PF4_SPECIALIZATION_KEY ?? 'STANDARD',
        mode: 'insensitive',
      },
      isActive: true,
      sport: {
        key: {
          equals: process.env.PF4_SPORT_KEY ?? 'PADEL',
          mode: 'insensitive',
        },
        isActive: true,
      },
    },
    include: { sport: true },
  });
  if (!specialization)
    throw new ConflictException({
      code: 'ASSESSMENT_SPORT_NOT_CONFIGURED',
      message: 'Configura lo sport e la specializzazione PF4 attivi',
    });
  const drivers = await loadEnabledDriverAreasForSelection(prisma, {
    specializationId: specialization.id,
  } as Parameters<typeof loadEnabledDriverAreasForSelection>[1]);
  return buildAssessmentConfiguration(
    prisma,
    specialization.sport.key,
    drivers,
  );
}
