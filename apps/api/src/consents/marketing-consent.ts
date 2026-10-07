import { consentDocumentHash } from './consent-texts';

/**
 * Consenso facoltativo e separato dalla privacy (A4.2): serve per messaggi
 * commerciali e di recupero (A8.18). Non blocca mai l'uso della piattaforma.
 */
const MARKETING_CONSENT_TEXT = {
  type: 'MARKETING',
  version: 'marketing-v1-2026-10-07',
  title: 'Comunicazioni promozionali di Performance Factory',
  summary:
    'Facoltativo. Autorizzi Performance Factory a inviarti offerte, premi e proposte per riprendere il percorso.',
  body: [
    'Con questo consenso Performance Factory puo inviarti comunicazioni promozionali su offerte, premi, iniziative dei circoli partner e proposte per riprendere il tuo percorso, nell app, via notifica o via email.',
    'Il consenso e facoltativo: senza di esso puoi usare la piattaforma esattamente allo stesso modo e ricevi soltanto le comunicazioni di servizio.',
    'Puoi revocarlo in qualsiasi momento dal tuo profilo. La revoca non pregiudica la liceita delle comunicazioni gia inviate.',
  ],
} as const;

export const MARKETING_CONSENT = {
  ...MARKETING_CONSENT_TEXT,
  body: [...MARKETING_CONSENT_TEXT.body],
  documentHash: consentDocumentHash(MARKETING_CONSENT_TEXT),
};
