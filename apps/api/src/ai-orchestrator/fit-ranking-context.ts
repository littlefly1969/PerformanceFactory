/**
 * Contesto per i prompt AI: etichette leggibili, nessun numero di tessera.
 * Null se l'atleta non l'ha ancora dichiarata.
 */
export type FitRankingContext = {
  source: 'SELF_DECLARED';
  declaredAt: string;
  padel: { current: string; best: string };
  tennis: { current: string; best: string };
} | null;

/**
 * Regola fissa, aggiunta a ogni prompt che riceve `fitRanking`: vale anche
 * quando l'AI Tuner ha attivato un prompt senza riferimenti alla classifica.
 */
export const FIT_RANKING_RULE =
  '- fitRanking: classifica FIT dichiarata dall’atleta (padel e tennis, attuale e migliore di sempre), null se non dichiarata. È un dato importante: usala per tarare livello, difficoltà e lessico. La classifica di tennis è solo un indizio sul passato sportivo e sull’allenabilità: non è un invito a parlare di tennis. Resta una dichiarazione: le aree lontane dal gioco (per esempio nutrizione o attrezzatura) si valutano dalle loro evidenze, non dalla classifica.';
