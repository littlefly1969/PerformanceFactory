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

/** Tutte le stringhe di un valore, in profondità: titoli, corpi, esercizi, consigli. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}

/** Primo termine vietato nei testi della proposta che arrivano all'atleta, o null. */
export function unsafeTrainingTerm(proposal: ProposalTexts, terms: string[]) {
  if (!terms.length) return null;
  const { summaryText, planItems, questions, objectives } = proposal;
  return findUnsafeTerm(
    strings([summaryText, planItems, questions, objectives]).join('. '),
    terms,
  );
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
