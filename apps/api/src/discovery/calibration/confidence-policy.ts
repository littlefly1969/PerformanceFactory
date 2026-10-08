import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Regole di confidence della specifica pre-paywall (PF-FS-PREPAYWALL §7.1):
 * - LESSON_ELIGIBILITY: profilo abbastanza attendibile per la lezione gratuita;
 * - R_CONSOLIDATION: evidenze sufficienti per consolidare R e generare P.
 * Nessuna soglia vive nel codice di dominio: le regole sono righe versionate
 * del back office (OP-02, OP-03) e ogni modifica crea una nuova versione.
 */
export const POLICY_KINDS = ['R_CONSOLIDATION', 'LESSON_ELIGIBILITY'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

/** Criteri combinati in AND; un criterio nullo non si applica. */
export type ConfidenceRule = {
  /** Confidence complessiva minima della valutazione (0-100). */
  minOverallConfidence: number | null;
  /** Confidence minima per area (0-100). */
  minAreaConfidence: number | null;
  /** Aree che devono raggiungere minAreaConfidence; nullo = tutte. */
  minAreasAtConfidence: number | null;
};

export type ConfidencePolicy = ConfidenceRule & {
  id: string;
  kind: PolicyKind;
  version: number;
};

/**
 * Prima versione di ciascuna regola, scritta solo se la tabella è vuota.
 * Valori provvisori da approvare (Parte C): il consolidamento riprende la
 * soglia di calibrazione precedente, la lezione chiede un profilo più leggero.
 */
export const INITIAL_CONFIDENCE_RULES: Record<PolicyKind, ConfidenceRule> = {
  R_CONSOLIDATION: {
    minOverallConfidence: 70,
    minAreaConfidence: 70,
    minAreasAtConfidence: null,
  },
  LESSON_ELIGIBILITY: {
    minOverallConfidence: 50,
    minAreaConfidence: null,
    minAreasAtConfidence: null,
  },
};

export type RuleCheck = {
  met: boolean;
  overallMet: boolean;
  areasMet: number;
  areasRequired: number;
  /** Aree sotto la soglia per area, dalla meno affidabile. */
  belowAreas: string[];
};

/** Verifica una regola su una valutazione. Senza aree la regola non è mai soddisfatta. */
export function checkRule(
  rule: ConfidenceRule,
  evaluation: {
    overallConfidence: number;
    drivers: { areaId: string; confidence: number }[];
  },
): RuleCheck {
  const drivers = evaluation.drivers;
  const overallMet =
    rule.minOverallConfidence === null ||
    evaluation.overallConfidence >= rule.minOverallConfidence;
  const below =
    rule.minAreaConfidence === null
      ? []
      : drivers
          .filter((d) => d.confidence < rule.minAreaConfidence!)
          .sort((a, b) => a.confidence - b.confidence);
  const areasRequired =
    rule.minAreaConfidence === null
      ? 0
      : Math.min(rule.minAreasAtConfidence ?? drivers.length, drivers.length);
  const areasMet = drivers.length - below.length;
  return {
    met: drivers.length > 0 && overallMet && areasMet >= areasRequired,
    overallMet,
    areasMet,
    areasRequired,
    belowAreas: below.map((d) => d.areaId),
  };
}

/** Una regola deve avere almeno un criterio, con valori nell'intervallo ammesso. */
export function ruleProblems(rule: ConfidenceRule) {
  const problems: string[] = [];
  const percent = (value: number | null) =>
    value === null || (Number.isInteger(value) && value >= 1 && value <= 100);
  if (rule.minOverallConfidence === null && rule.minAreaConfidence === null)
    problems.push('Indica almeno una soglia di confidence');
  if (!percent(rule.minOverallConfidence) || !percent(rule.minAreaConfidence))
    problems.push('Le soglie di confidence vanno da 1 a 100');
  if (
    rule.minAreasAtConfidence !== null &&
    (!Number.isInteger(rule.minAreasAtConfidence) ||
      rule.minAreasAtConfidence < 1 ||
      rule.minAreasAtConfidence > 20)
  )
    problems.push('Il numero di aree va da 1 a 20');
  if (rule.minAreasAtConfidence !== null && rule.minAreaConfidence === null)
    problems.push('Il numero di aree richiede una soglia per area');
  return problems;
}

type Db = Pick<PrismaService, 'confidencePolicy'> | Prisma.TransactionClient;

const select = {
  id: true,
  kind: true,
  version: true,
  minOverallConfidence: true,
  minAreaConfidence: true,
  minAreasAtConfidence: true,
} as const;

/**
 * Regola in vigore: l'ultima versione. La prima nasce alla prima lettura con
 * un inserimento che ignora i doppioni, così due letture parallele non falliscono.
 */
export async function loadActivePolicy(
  db: Db,
  kind: PolicyKind,
): Promise<ConfidencePolicy> {
  const latest = await db.confidencePolicy.findFirst({
    where: { kind },
    orderBy: { version: 'desc' },
    select,
  });
  if (latest) return latest as ConfidencePolicy;
  await db.confidencePolicy.createMany({
    data: [{ kind, version: 1, ...INITIAL_CONFIDENCE_RULES[kind] }],
    skipDuplicates: true,
  });
  return (await db.confidencePolicy.findFirstOrThrow({
    where: { kind },
    orderBy: { version: 'desc' },
    select,
  })) as ConfidencePolicy;
}

/** Storico delle versioni, dalla più recente, con autore e nota. */
export async function listPolicyVersions(prisma: PrismaService) {
  await Promise.all(POLICY_KINDS.map((kind) => loadActivePolicy(prisma, kind)));
  const rows = await prisma.confidencePolicy.findMany({
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
    select: {
      ...select,
      note: true,
      createdAt: true,
      createdBy: { select: { email: true } },
    },
  });
  return POLICY_KINDS.map((kind) => {
    const versions = rows
      .filter((r) => r.kind === kind)
      .map(({ createdBy, ...row }) => ({
        ...row,
        createdBy: createdBy?.email ?? null,
      }));
    return { kind, active: versions[0], versions };
  });
}

/**
 * Pubblica una nuova versione della regola: le precedenti restano per l'audit
 * delle valutazioni che le hanno usate. Serializzata per tipo di regola.
 */
export async function publishPolicy(
  prisma: PrismaService,
  kind: PolicyKind,
  rule: ConfidenceRule,
  note: string | null,
  actorId: string,
) {
  const problems = ruleProblems(rule);
  if (problems.length) throw new BadRequestException(problems.join('. '));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pf-confidence-policy:${kind}`}, 0))`;
    const current = await loadActivePolicy(tx, kind);
    return tx.confidencePolicy.create({
      data: {
        kind,
        version: current.version + 1,
        ...rule,
        note,
        createdById: actorId,
      },
      select,
    });
  });
}
