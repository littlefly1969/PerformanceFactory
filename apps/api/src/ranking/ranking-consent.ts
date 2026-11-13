import { consentDocumentHash } from '../consents/consent-texts';

/**
 * Consenso facoltativo a comparire nel ranking con nome e iniziale del
 * cognome. Senza consenso l'atleta è in classifica come «Atleta»: posizione,
 * reale e potenziale restano, il nome no.
 */
const RANKING_VISIBILITY_TEXT = {
  type: 'RANKING_VISIBILITY',
  version: 'ranking-v1-2026-11-13',
  title: 'Nome nel ranking della piattaforma',
  summary:
    'Facoltativo. Gli altri atleti della tua fascia vedono il tuo nome e l’iniziale del cognome accanto a reale e potenziale.',
  body: [
    'Con questo consenso il tuo nome e l iniziale del tuo cognome compaiono nella classifica della tua fascia, visibile agli altri atleti abbonati, accanto alla tua posizione, al tuo livello reale e al tuo potenziale.',
    'Il consenso e facoltativo: senza di esso resti in classifica con la tua posizione e i tuoi numeri, ma gli altri vedono soltanto «Atleta».',
    'Puoi revocarlo in qualsiasi momento dal tuo profilo: da quel momento il tuo nome non compare piu.',
  ],
} as const;

export const RANKING_VISIBILITY_CONSENT = {
  ...RANKING_VISIBILITY_TEXT,
  body: [...RANKING_VISIBILITY_TEXT.body],
  documentHash: consentDocumentHash(RANKING_VISIBILITY_TEXT),
};
