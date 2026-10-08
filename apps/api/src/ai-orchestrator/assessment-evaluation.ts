import { BadGatewayException, Logger } from '@nestjs/common';
import { hashJson } from './proposal-audit';
import { requestStructuredProposal } from './proposal-structured-transport';
import { resolveModel, resolveProvider } from './provider-config';
import {
  ATHLETE_LEVELS,
  AthleteLevel,
  COMMITMENT_LEVELS,
  CommitmentLevel,
  ASSESSMENT_LIMITS,
  AssessmentEvaluationInput,
  AssessmentEvaluationOutput,
  AssessmentEvaluationResult,
  assessmentFormatRules,
  buildAssessmentJsonSchema,
} from './assessment-evaluation-model';

export function buildAssessmentPrompt(input: AssessmentEvaluationInput) {
  return {
    system: `${input.basePrompt.trim()}\n\n${assessmentFormatRules(input)}`,
    user: {
      task: input.drivers.some((d) => d.previous)
        ? 'Aggiorna la R provvisoria di ogni driver con le risposte dei round di calibrazione.'
        : 'Stima la R provvisoria di ogni driver dal primo set di risposte.',
      scale: input.scale,
      athleteContext: input.athleteContext,
      availability: input.availability,
      drivers: input.drivers,
    },
  };
}

export async function evaluateAssessment(
  logger: Logger,
  input: AssessmentEvaluationInput,
): Promise<AssessmentEvaluationResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const prompt = buildAssessmentPrompt(input);
  const inputJson = { promptVersionId: input.promptVersionId, prompt };
  let raw: unknown;
  if (provider === 'stub') {
    raw = stubAssessmentEvaluation(input);
  } else {
    const result = await requestStructuredProposal(
      logger,
      provider,
      model,
      inputJson,
      { ...prompt, schema: buildAssessmentJsonSchema() },
      'assessment_evaluation',
    );
    try {
      raw = JSON.parse(result.outputText);
    } catch {
      raw = null;
    }
  }
  const problems: string[] = [];
  const output = validateAssessmentEvaluation(raw, input, problems);
  if (!output) {
    logger.warn(
      `INVALID_ASSESSMENT_EVALUATION ${provider}/${model}: ${problems.join('; ')}`,
    );
    throw new BadGatewayException({
      code: 'INVALID_ASSESSMENT_EVALUATION',
      message: 'La valutazione delle risposte non è riuscita. Riprova.',
    });
  }
  return {
    provider,
    model,
    promptHash: hashJson(inputJson),
    inputJson,
    output,
    latencyMs: Date.now() - startedAt,
  };
}

/** Stub deterministico: media normalizzata dei punteggi delle opzioni, confidence bassa. */
export function stubAssessmentEvaluation(
  input: AssessmentEvaluationInput,
): AssessmentEvaluationOutput {
  const { minScore, maxScore } = input.scale;
  const drivers = input.drivers.map((driver) => {
    const ratios = driver.answers
      .filter((a) => a.optionScore !== null && a.optionScoreRange)
      .map(({ optionScore, optionScoreRange: range }) =>
        range!.max > range!.min
          ? (optionScore! - range!.min) / (range!.max - range!.min)
          : 0.5,
      );
    const ratio = ratios.length
      ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length
      : 0.5;
    // Ogni risposta in più alza la confidence: 15 per risposta, al massimo 90.
    return {
      areaId: driver.areaId,
      score: Math.round(minScore + ratio * (maxScore - minScore)),
      confidence: Math.min(90, ratios.length * 15),
      rationale: `Stima provvisoria da ${ratios.length} risposte di autovalutazione su ${driver.name}.`,
      evidenceGaps: [
        'Domande di approfondimento o un micro-test per confermare il livello.',
      ],
      commitment: 'UNKNOWN' as CommitmentLevel,
    };
  });
  const average = drivers.length
    ? drivers.reduce((sum, d) => sum + (d.score - minScore), 0) /
      drivers.length /
      Math.max(1, maxScore - minScore)
    : 0;
  return {
    summary:
      'Prima lettura provvisoria delle tue risposte: la confidenza crescerà con le prossime domande.',
    overallConfidence: drivers.length
      ? Math.round(
          drivers.reduce((sum, d) => sum + d.confidence, 0) / drivers.length,
        )
      : 0,
    level: ATHLETE_LEVELS[Math.min(2, Math.floor(average * 3))],
    levelConfidence: Math.min(...drivers.map((d) => d.confidence), 100),
    drivers,
  };
}

/** Contratto rigido: un driver mancante, duplicato o fuori scala invalida tutto. */
export function validateAssessmentEvaluation(
  raw: unknown,
  input: AssessmentEvaluationInput,
  problems: string[] = [],
): AssessmentEvaluationOutput | null {
  const record = raw as Partial<Record<string, unknown>> | null;
  if (!record || typeof record !== 'object') {
    problems.push('output non JSON');
    return null;
  }
  const summary = text(record.summary, ASSESSMENT_LIMITS.summary);
  if (!summary) problems.push('summary non valido');
  const overallConfidence = percent(record.overallConfidence);
  if (overallConfidence === null) problems.push('overallConfidence non valida');
  const level = oneOf(record.level, ATHLETE_LEVELS);
  if (!level) problems.push('level non valido');
  const levelConfidence = percent(record.levelConfidence);
  if (levelConfidence === null) problems.push('levelConfidence non valida');
  const expected = new Set(input.drivers.map((d) => d.areaId));
  const seen = new Set<string>();
  const drivers: AssessmentEvaluationOutput['drivers'] = [];
  for (const item of Array.isArray(record.drivers) ? record.drivers : []) {
    const entry = item as Partial<Record<string, unknown>>;
    const areaId = typeof entry?.areaId === 'string' ? entry.areaId : '';
    if (!expected.has(areaId) || seen.has(areaId)) {
      problems.push(`driver inatteso o duplicato: ${areaId || '?'}`);
      continue;
    }
    seen.add(areaId);
    const score = Number(entry.score);
    const confidence = percent(entry.confidence);
    const rationale = text(entry.rationale, ASSESSMENT_LIMITS.rationale);
    const gaps = Array.isArray(entry.evidenceGaps) ? entry.evidenceGaps : null;
    const evidenceGaps = (gaps ?? []).map((gap) =>
      text(gap, ASSESSMENT_LIMITS.evidenceGap),
    );
    if (
      typeof entry.score !== 'number' ||
      !Number.isFinite(score) ||
      score < input.scale.minScore ||
      score > input.scale.maxScore
    )
      problems.push(`score fuori scala per ${areaId}`);
    if (confidence === null) problems.push(`confidence non valida ${areaId}`);
    if (!rationale) problems.push(`rationale non valida per ${areaId}`);
    const commitment = oneOf(entry.commitment, COMMITMENT_LEVELS);
    if (!commitment) problems.push(`commitment non valido per ${areaId}`);
    if (
      !gaps ||
      gaps.length > ASSESSMENT_LIMITS.evidenceGaps ||
      evidenceGaps.some((gap) => !gap)
    )
      problems.push(`evidenceGaps non validi per ${areaId}`);
    drivers.push({
      areaId,
      score: Math.round(score * 10) / 10,
      confidence: confidence ?? 0,
      rationale: rationale ?? '',
      evidenceGaps: evidenceGaps as string[],
      commitment: commitment ?? 'UNKNOWN',
    });
  }
  for (const areaId of expected)
    if (!seen.has(areaId)) problems.push(`driver mancante: ${areaId}`);
  if (problems.length) return null;
  // Stesso ordine dei driver ricevuti, indipendente dall'ordine del modello.
  const order = input.drivers.map((d) => d.areaId);
  drivers.sort((a, b) => order.indexOf(a.areaId) - order.indexOf(b.areaId));
  return {
    summary: summary!,
    overallConfidence: overallConfidence!,
    level: level as AthleteLevel,
    levelConfidence: levelConfidence!,
    drivers,
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : null;
}

function text(value: unknown, max: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function percent(value: unknown) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}
