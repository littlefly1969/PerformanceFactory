import { BadRequestException, Logger } from '@nestjs/common';
import { findUnsafeTerm } from './micro-test-safety';
import { CycleProposalInput } from './proposal-provider-model';

/**
 * Parole vietate negli allenamenti (sport, aree a calendario e cicli di area):
 * stesso controllo dei micro-test, con la lista che l'amministratore gestisce
 * in `CalibrationConfig.unsafeTrainingTerms`. Con la lista vuota non si
 * controlla nulla e non si fanno chiamate in più.
 */
export const TRAINING_SAFETY_ATTEMPTS = 2;

type ProposalTexts = {
  provider: string;
  model: string;
  summaryText: string;
  planItems: unknown[];
  questions: unknown[];
  objectives?: unknown[];
};

const text = (value: unknown) => (typeof value === 'string' ? [value] : []);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? (value as unknown[]) : [];

/** Testi di una seduta: sul programma sportivo in `content`, sulle aree nei metadati. */
function sessionTexts(content: Record<string, unknown>) {
  return [
    ...text(content.goal),
    ...text(content.prerequisites),
    ...list(content.exercises).flatMap((value) => {
      const e = record(value);
      return [e.name, e.prescription, e.cue, e.demo].flatMap(text);
    }),
  ];
}

/**
 * Solo i testi che l'atleta legge: sintesi, sedute ed esercizi, obiettivi,
 * domande e risposte. Identificativi, enum e metadati tecnici aggiunti dal
 * backend (provider, modello, versione del prompt) restano fuori: l'AI non
 * potrebbe toglierli riscrivendo il piano.
 */
function visibleTexts(proposal: ProposalTexts) {
  return [
    ...text(proposal.summaryText),
    ...proposal.planItems.flatMap((value) => {
      const item = record(value);
      const metadata = record(item.metadata);
      return [
        ...[item.title, item.body, item.equipment, item.reps].flatMap(text),
        ...[metadata.equipment, metadata.reps].flatMap(text),
        ...sessionTexts(record(item.content)),
        ...sessionTexts(metadata),
      ];
    }),
    ...list(proposal.objectives).flatMap((value) => {
      const o = record(value);
      return [o.title, o.targetLabel].flatMap(text);
    }),
    ...proposal.questions.flatMap((value) => {
      const q = record(value);
      return [
        ...text(q.text),
        ...list(q.options).flatMap((o) => text(record(o).label)),
      ];
    }),
  ];
}

/** Primo termine vietato nei testi della proposta che arrivano all'atleta, o null. */
export function unsafeTrainingTerm(proposal: ProposalTexts, terms: string[]) {
  if (!terms.length) return null;
  return findUnsafeTerm(visibleTexts(proposal).join('. '), terms);
}

/**
 * Genera la proposta con le parole vietate nel prompt; se il testo ne contiene
 * una la riscrive una volta dicendo all'AI quale, poi rinuncia. L'operazione
 * di generazione registra il codice e riprova più tardi come per gli altri errori.
 */
export async function generateSafeProposal<
  I extends CycleProposalInput,
  P extends ProposalTexts,
>(
  logger: Logger,
  input: I,
  terms: string[],
  generate: (input: I) => Promise<P>,
): Promise<P> {
  if (!terms.length) return generate(input);
  let rejectedTerm: string | undefined;
  for (let attempt = 1; attempt <= TRAINING_SAFETY_ATTEMPTS; attempt++) {
    const proposal = await generate({
      ...input,
      unsafeTerms: terms,
      rejectedTerm,
    });
    const term = unsafeTrainingTerm(proposal, terms);
    if (!term) return proposal;
    logger.warn(
      `UNSAFE_TRAINING_CONTENT ${proposal.provider}/${proposal.model} tentativo ${attempt}: ${term}`,
    );
    rejectedTerm = term;
  }
  throw new BadRequestException({
    code: 'UNSAFE_TRAINING_CONTENT',
    message: 'Non siamo riusciti a preparare un allenamento sicuro. Riprova.',
  });
}
