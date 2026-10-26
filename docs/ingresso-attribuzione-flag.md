# Ingresso: provenienza, circoli, eventi, 18+ e feature flag

Prima slice del percorso atleta allineato al Product Blueprint (A2, A4, A5, A7,
A8; A6 ricostruito dagli altri capitoli). Copre l'arrivo dell'atleta fino alla
registrazione.

## Maggiore età

L'MVP è solo 18+. La registrazione email (`POST /auth/register-athlete`) e il
completamento Google (`POST /auth/google/register/complete`) richiedono
`adultConfirmed: true`; altrimenti rispondono 400 prima di scrivere qualsiasi
dato. La dichiarazione è salvata in `User.adultConfirmedAt`. Nel web la casella
è nel modulo email e, per Google, nella pagina consensi.

## Consenso marketing

È facoltativo, separato da privacy e assistente AI e non blocca nulla.

- Alla registrazione: `marketingAccepted` in `POST /consents/required` o nel
  completamento Google.
- Dal profilo: `GET`/`PUT /consents/marketing` con `{ granted }`. La revoca
  imposta `withdrawnAt`; un nuovo consenso crea una nuova riga.
- Il testo è versionato nel codice (`apps/api/src/consents/marketing-consent.ts`,
  versione `marketing-v1-2026-10-07`).

## Provenienza e circoli

Il browser conserva in `localStorage` un `anonymousId` (UUID) e due sorgenti,
prima e ultima, lette dai parametri del link:

| Parametro | Campo |
|---|---|
| `utm_source`, `utm_medium`, `utm_campaign` | `source`, `medium`, `campaign` |
| `club` | codice del circolo (QR o link del circolo) |
| `ref` | codice personale di chi invita |

La prima sorgente non si sovrascrive; una visita diretta non cancella quelle già
note. Alla registrazione il web invia `attribution: { anonymousId, firstTouch,
lastTouch }` e il backend salva `UserAttribution` nella stessa transazione
dell'utente. Circolo e referrer valgono dalla prima sorgente che li porta,
altrimenti dall'ultima (regola proposta, da confermare quando arriva A6).
Codici di circoli sospesi o sconosciuti vengono ignorati; senza tracce la
registrazione è `source: direct`.

Ciclo di vita nel browser (`apps/web/app/lib/attribution.ts`):

- id anonimo e sorgenti si azzerano appena la registrazione (e-mail o Google) o
  l'accesso con e-mail riescono: chi usa lo stesso browser dopo riparte pulito e
  non eredita campagna, circolo o referral;
- una registrazione rifiutata li conserva per il nuovo tentativo;
- scadono comunque dopo 30 giorni senza visite (`ATTRIBUTION_TTL_DAYS`).

I circoli (`Partner`, `kind = CLUB`) si gestiscono in `/admin/partners`: nome,
città o zona, codice, stato. La pagina mostra il link da mettere nel QR
(`/start?club=<codice>`) e gli atleti registrati per circolo.

## Eventi del funnel

Tabella append-only `AnalyticsEvent`. Il web invia, senza bloccare
l'interfaccia, `POST /public/events` (20 richieste al minuto per IP, al massimo 5
eventi per richiesta):

| Evento | Quando |
|---|---|
| `landing_viewed` | apertura di `/start` |
| `discovery_started` | dall'intro alla prima domanda |
| `discovery_completed` | ingresso nell'analisi |
| `registration_started` | ingresso nella registrazione |

`registration_completed` è scritto dal server, nella transazione di
registrazione, con metodo, sorgente, campagna, circolo e referral.

Protezioni sugli eventi del browser:

- solo nomi in elenco;
- proprietà ammesse per evento (`CLIENT_EVENT_PROPERTIES`): oggi solo `path` di
  `landing_viewed`, nel formato di un percorso. Le altre chiavi (per esempio
  `email` o `phone`) vengono scartate, quindi gli eventi anonimi non possono
  contenere dati personali;
- ogni evento ha un `eventId` UUID unico: un reinvio non crea un secondo evento;
- una bozza ripresa non riconta gli eventi.

Chi conosce l'API può comunque inventare id anonimi ed eventi entro il limite
di richieste: i numeri del funnel vanno letti come indicativi finché non c'è una
prova d'origine (vedi Aperti).

`GET /admin/analytics/funnel?days=30` conta le persone distinte per evento e le
registrazioni per circolo; il riepilogo è in `/admin/partners`.

## Feature flag e beta tester

I flag sono dichiarati nel codice (`apps/api/src/features/feature-flags.ts`) e
il loro stato è nel database: un flag nuovo nasce spento. Un flag acceso vale:

1. per tutti se `rolloutPercent` è 100;
2. per i beta tester (`User.isBetaTester`) se `betaTesters` è attivo;
3. per una percentuale stabile di utenti (bucket sha256 di flag e utente).

| Endpoint | Chi |
|---|---|
| `GET /features/me` | utente autenticato, mappa `chiave → boolean` |
| `GET /public/features` | anonimo, solo i flag al 100% |
| `GET`/`PATCH /admin/feature-flags(/:key)` | admin; ogni modifica scrive `FeatureFlagChange` |
| `GET`/`PUT /admin/beta-testers` | admin, per e-mail; ogni ingresso o uscita scrive `BetaTesterChange` |

Autore, prima e dopo restano nel registro anche per i beta tester, perché
cambiano chi riceve una funzione. `FeatureFlag.updatedById`,
`FeatureFlagChange.actorId` e `BetaTesterChange.actorId` sono collegati a
`User`: se l'account dell'autore viene cancellato la riga resta, con autore
vuoto.

La pagina è `/admin/feature-flags`. Primo flag: `referral_share`, che mostra
all'atleta nel profilo il suo link di invito (`GET /athlete/referral`, codice
generato al primo uso).

## Testi corretti

- Niente più «7 giorni gratis», «Attiva la prova gratuita» e «Prova gratuita
  attiva»: la fase gratuita del Blueprint è la calibrazione, non una prova a
  giorni.
- Niente più «Programma di 4 settimane» tra le cose che si attivano dopo.
- La P a passo fisso non arriva più all'atleta, né a schermo né nelle risposte
  delle API: percorso, home, progressi, profilo performance e submit
  dell'onboarding la omettono per il ruolo `USER`, e la priorità del risultato
  è il driver con la R più bassa. Resta nel database e nelle viste dei
  professionisti finché non arrivano gli scenari P3/P6/P12.

## Aperti

- Domanda zona/circolo nella discovery: rinviata, le zone non sono definite e
  manca un tipo di domanda testuale.
- **Blocca il lancio:** `/start` crea l'`anonymousId` e invia gli eventi appena
  si apre, prima di qualsiasi consenso. Va deciso con chi segue privacy e
  cookie se serve un consenso, un banner o eventi senza identificativo.
- Conservazione di `AnalyticsEvent`: nessuna cancellazione automatica. Va
  fissato quanto tenere gli eventi anonimi e quelli collegati a un utente.
- Prova d'origine degli eventi (token firmato o simile) se il funnel deve
  avere valore decisionale.
- Regola prima/ultima sorgente per circolo e referral: da confermare con A6.
- Premi del referral (A8-D05): non implementati.
