/**
 * Contesto per i prompt AI: etichette leggibili, nessun numero di tessera.
 * Null se l'atleta non l'ha ancora dichiarata.
 */
export type FitRankingContext = {
  source: 'SELF_DECLARED';
  declaredAt: string;
  /** `playtomic`: livello Playtomic dichiarato (0-7), solo se indicato. */
  padel: { current: string; best: string; playtomic?: string };
  tennis: { current: string; best: string };
} | null;

/**
 * Regola fissa, aggiunta a ogni prompt che riceve `fitRanking`: vale anche
 * quando l'AI Tuner ha attivato un prompt senza riferimenti alla classifica.
 */
export const FIT_RANKING_RULE =
  '- fitRanking: classifica FIT dichiarata dall’atleta (padel e tennis, attuale e migliore di sempre), null se non dichiarata. È un dato importante: usala per tarare livello, difficoltà e lessico. Il livello Playtomic di padel (da 0 a 7), se presente, è un altro indizio sul livello di gioco. La classifica di tennis è solo un indizio sul passato sportivo e sull’allenabilità: non è un invito a parlare di tennis. Resta una dichiarazione: le aree lontane dal gioco (per esempio nutrizione o attrezzatura) si valutano dalle loro evidenze, non dalla classifica.';
