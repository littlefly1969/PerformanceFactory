import { createHash } from 'crypto';

export const REQUIRED_CONSENT_TYPES = {
  privacy: 'PRIVACY',
  aiAssistant: 'AI_ASSISTANT',
} as const;

export type RequiredConsentType =
  (typeof REQUIRED_CONSENT_TYPES)[keyof typeof REQUIRED_CONSENT_TYPES];

export const REQUIRED_CONSENTS = [
  {
    type: REQUIRED_CONSENT_TYPES.privacy,
    version: 'privacy-v1-2026-05-04',
    title: 'Informativa privacy e trattamento dati Performance Factory',
    summary:
      'Autorizzi il trattamento dei dati necessari a creare e gestire il tuo account, erogare il servizio, mantenere sicurezza, audit e tracciabilita operativa.',
    body: [
      'Performance Factory tratta dati identificativi e di contatto, dati di accesso, dati tecnici di sicurezza, dati inseriti nei questionari, informazioni su obiettivi sportivi, esercizi, risposte, avanzamento e relazioni con professionisti.',
      'I dati sono usati per autenticazione, gestione account, onboarding, generazione e revisione dei percorsi, monitoraggio storico, sicurezza applicativa, prevenzione abusi, audit tecnico e adempimenti di legge.',
      'I dati sanitari o assimilabili eventualmente inseriti dall utente devono essere limitati a quanto necessario al percorso. La piattaforma non sostituisce medico, fisioterapista, nutrizionista, psicologo o altro professionista sanitario.',
      'L accesso ai dati e limitato agli utenti autorizzati in base al ruolo: atleta, professionista collegato, amministratore tecnico/organizzativo. Le operazioni rilevanti possono essere registrate per sicurezza e tracciabilita.',
      'Puoi chiedere accesso, rettifica, limitazione, cancellazione nei limiti previsti dalla legge, e puoi revocare i consensi non necessari. La revoca non pregiudica la liceita dei trattamenti gia effettuati.',
      'Confermando dichiari di aver letto e compreso questa informativa sintetica e accetti il trattamento dei dati necessario all uso della piattaforma.',
    ],
  },
  {
    type: REQUIRED_CONSENT_TYPES.aiAssistant,
    version: 'ai-assistant-v1-2026-05-04',
    title: 'Consenso esplicito all uso dell assistente AI',
    summary:
      'Autorizzi l uso di sistemi AI per analizzare obiettivi, risposte e storico e proporre contenuti che restano soggetti a verifica umana e limiti di sicurezza.',
    body: [
      'L assistente AI puo elaborare obiettivi, questionari, risposte, storico, profilo sportivo e vincoli dichiarati per generare valutazioni, prompt, proposte operative, domande e materiali di supporto.',
      'L AI non e un professionista sanitario, non formula diagnosi, non prescrive farmaci, non prescrive diete cliniche e non sostituisce medici, fisioterapisti, nutrizionisti, psicologi, allenatori o altri professionisti qualificati.',
      'Le risposte AI possono contenere errori, incompletezze o indicazioni non adatte al caso specifico. I contenuti devono essere valutati con prudenza e, quando previsto, revisionati da un professionista umano.',
      'In presenza di dolore acuto, trauma, sintomi neurologici, dolore toracico, svenimenti, disturbi alimentari, patologie note, farmaci o condizioni mediche non controllate, devi rivolgerti a un professionista qualificato prima di seguire indicazioni operative.',
      'Non devi inserire dati non necessari, dati di terzi, informazioni illecite o richieste orientate a doping, frode, danno a te o ad altri, o pratiche contrarie alla salute e allo spirito sportivo.',
      'Confermando dichiari di sapere quando stai interagendo con funzioni AI e autorizzi l elaborazione dei dati necessari per tali funzioni.',
    ],
  },
] as const;

export function consentDocumentHash(consent: {
  type: string;
  version: string;
  title: string;
  summary: string;
  body: readonly string[];
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        type: consent.type,
        version: consent.version,
        title: consent.title,
        summary: consent.summary,
        body: consent.body,
      }),
    )
    .digest('hex');
}
