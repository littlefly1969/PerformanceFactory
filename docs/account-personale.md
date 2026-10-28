# Account personale

Foto, tessera e classifiche FIT, indirizzo e abbonamento si gestiscono da un
solo posto: il menu dell'avatar, uguale nella fase gratuita e da abbonato.
Requisiti di partenza: [specifica](proposte/gestione-account-personale.md).

## Navigazione

| Voce del menu | Pagina | Cosa fa |
|---|---|---|
| Foto | `/account/foto` | La schermata foto del benvenuto, con la freccia indietro al posto dell'avanzamento. |
| Tessera e classifiche FIT | `/account/fit` | Lo stesso editor FIT del profilo, invariato. |
| Indirizzo | `/account/indirizzo` | Unico editor dell'indirizzo, con la ricerca assistita. |
| Abbonamento | `/account/abbonamento` | Dati reali del contratto, disdetta e revoca quando consentite. |

`/account` elenca le quattro voci. Il menu compare nelle home gratuite
(prima e dopo l'assessment), nel profilo sportivo `/journey/profilo`, nella
home abbonato `/user` e nell'intestazione delle pagine `/user/*`; contiene
anche «Esci». È un pulsante con `aria-expanded`: si apre con tastiera o touch,
si chiude con Esc (il fuoco torna all'avatar) o toccando fuori.

**Ritorni.** Ogni voce porta `?da=<pagina>`; Indietro e Fatto tornano lì. Le
pagine ammesse sono una tabella fissa (`app/account/account-links.ts`: home,
profilo, circolo, user, user-profilo, account): un valore diverso, compreso un
URL, riporta a `/account`. Il vecchio `/journey/profilo#indirizzo` apre
`/account/indirizzo?da=profilo`; dalla scelta del circolo il richiamo è
«Completa l'indirizzo nel tuo account», con ritorno al circolo, che rilegge le
distanze quando si riapre.

**Accesso.** `/account` è protetto da `proxy.ts` come `/user`. Le pagine
chiedono `/auth/journey`: senza sessione portano al login; con i consensi da
dare o il benvenuto mai aperto portano a `/journey`, che conduce al passo
mancante. Non dipendono da abbonamento, programma o fase dell'assessment. Le
API restano l'unico controllo: tutte sono del ruolo `USER`.

**Benvenuto.** Il primo inserimento di foto e FIT resta in `/benvenuto/foto`.
I profili sportivi non hanno più editor personali: restano Spider, R,
calibrazione, lezione, programma, disponibilità, coach, referral e preferenze.

## Indirizzo assistito con Google Places

Con `GOOGLE_PLACES_API_KEY` impostata l'atleta cerca l'indirizzo, sceglie un
suggerimento e salva solo un indirizzo che il backend ha riconosciuto. Senza
chiave resta il modulo a quattro campi di prima, con il geocoding Nominatim
dopo l'invio.

```
browser                         API                               Google Places (New)
  │ testo (≥3 car., 300 ms) ─►  POST /athlete/address/suggestions ─► places:autocomplete
  │ scelta ────────────────►    POST /athlete/address/resolve    ─► places/{id} (Place Details)
  │                ◄── indirizzo + scelta firmata (HMAC, 15 min, legata all'utente)
  │ Salva ─────────────────►    POST /athlete/address/selection  ─► UserAddress (GOOGLE_PLACES)
```

- **Session token.** Il browser genera un token per ogni ricerca e lo usa
  per tutti i suggerimenti e per la risoluzione della scelta; dopo la scelta
  ne genera uno nuovo.
- **Field mask.** Autocomplete chiede solo `placeId`, testo e formato
  strutturato. Place Details chiede `id,formattedAddress,addressComponents,location`
  (livello Essentials). Il rinnovo delle coordinate chiede solo `location`.
- **Solo Italia.** `includedRegionCodes: ["it"]`, tipi `street_address`,
  `premise`, `subpremise`, `route`, lingua italiana.
- **Indirizzo completo.** Servono via, numero civico, CAP di 5 cifre,
  comune, sigla di provincia (da `administrative_area_level_2`), paese IT e
  posizione. Se manca qualcosa l'API risponde `complete: false` con le parti
  mancanti e la pagina lo dice; niente viene inventato.
- **Niente fiducia nel browser.** Il salvataggio accetta solo la scelta
  firmata restituita da `resolve`: coordinate e campi non si possono
  modificare, scadono dopo 15 minuti e valgono solo per l'atleta che li ha
  chiesti. Cambiare il testo dopo la scelta la annulla.
- **Manuale spento.** Con Google Places attivo, `POST /athlete/address`
  (testo libero) risponde 409.
- **Provider non disponibile.** Timeout (`GOOGLE_PLACES_TIMEOUT_MS`, 4 s) o
  errore danno 503: l'indirizzo salvato resta, la bozza resta nel campo e c'è
  «Riprova». Le risposte arrivate dopo una ricerca più recente si scartano.
- **Frequenza.** Limite in memoria per atleta: 60 richieste al minuto
  sui suggerimenti, 20 sulle risoluzioni.
- **Log.** Si registrano solo stato HTTP o timeout, mai testo o indirizzi.
- **Attribuzione.** Sotto i suggerimenti e sull'indirizzo riconosciuto
  compare «Google Maps» (`translate="no"`), come chiedono le policy quando
  non c'è una mappa.

### Dati conservati

| Campo di `UserAddress` | Origine | Conservazione |
|---|---|---|
| `street`, `postalCode`, `city`, `province` | scelti e confermati dall'atleta, normalizzati da Google | finché l'atleta li cambia |
| `placeId` | Google | senza limite (consentito dalle policy), serve al rinnovo |
| `latitude`, `longitude`, `geocodedAt` | Google | al massimo 30 giorni: rinnovate dopo 25 giorni |
| `source` (`MANUAL` / `GOOGLE_PLACES`), `verifiedAt` | backend | — |

Il worker `AddressLocationWorker` gira una volta al giorno (spegnibile con
`ADDRESS_LOCATION_WORKER=false`): rinnova con Place Details le coordinate
Google più vecchie di 25 giorni e, se il rinnovo non riesce oltre i 30
giorni, le cancella lasciando l'indirizzo; la distanza diventa «non
calcolabile» finché l'atleta non sceglie di nuovo l'indirizzo. Nessuna cache
di suggerimenti o risposte. Gli indirizzi già salvati prima di questa
modifica restano `MANUAL`, senza verifica: si chiede la scelta solo quando
l'atleta li cambia. La selezione non prova la residenza.

### Configurazione Google Cloud

1. Creare (o scegliere) un progetto in Google Cloud Console e collegare un
   account di fatturazione.
2. Abilitare solo **Places API (New)** (`places.googleapis.com`).
3. Creare una chiave API e limitarla: restrizione API a Places API (New);
   restrizione applicazione per indirizzo IP del server di produzione. La
   chiave non va nel bundle web né nel repository.
4. Impostare sul server `GOOGLE_PLACES_API_KEY` (in `.env.production`, già
   passata da `infra/docker-compose.prod.example.yml`) e riavviare l'API.
   `GOOGLE_PLACES_ENABLED=false` spegne la ricerca senza togliere la chiave.
5. Quote e consumi: in *APIs & Services → Places API (New) → Quotas* si
   possono abbassare i limiti giornalieri per metodo; gli avvisi di budget
   in *Billing → Budgets & alerts* avvisano ma **non bloccano** la spesa.
   Costi: Autocomplete con session token e Place Details Essentials sono
   fatturati per sessione/richiesta secondo il listino Google; il rinnovo
   giornaliero è una Place Details Essentials per indirizzo ogni 25 giorni.

Fonti: [chiave](https://developers.google.com/maps/documentation/places/web-service/get-api-key),
[Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete),
[Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details),
[sessioni](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens),
[fatturazione](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing),
[policy](https://developers.google.com/maps/documentation/places/web-service/policies).

## Abbonamento

`GET /payments/subscription/account` restituisce `state`, `entitled`,
`subscription`, `cancelDeadline`, `canCancel` e `canResume`. Non cambia
`GET /payments/subscription`, che resta la base per checkout, programma e
ritorno dal pagamento (`/abbonamento`).

| `state` | Quando | Cosa vede l'atleta |
|---|---|---|
| `ACTIVE` | contratto attivo | dati, prossimo addebito, disdetta entro il preavviso |
| `GRACE` | addebito fallito, tolleranza in corso | fine della tolleranza |
| `PAUSED` | contratto sospeso | che non è terminato e non va riacquistato |
| `PENDING` | checkout aperto e non ancora confermato | pagamento in verifica, nessuna data |
| `ENDED` | nessun contratto in corso, ultimo `EXPIRED` | data di fine |
| `NONE` | nessuno dei precedenti | che il programma si sceglie dagli scenari |

Disdetta e revoca usano le API esistenti (`/payments/subscription/cancel` e
`/resume`) dopo una conferma esplicita, con la stessa scadenza di preavviso
(`PAYMENTS_CANCEL_NOTICE_HOURS`). Si mostrano solo i campi presenti: niente
fatture, carte o storico addebiti.

## Test

API: `places.service.spec.ts` (normalizzazione, dati incompleti, field mask,
session token, timeout ed errori), `athlete-address.spec.ts` (scelta firmata,
manomissione, utente diverso, scadenza, manuale spento, rinnovo e scadenza
delle coordinate), `subscriptions-account.spec.ts` (stati e azioni).
Web: `app/account/account.test.tsx` (accesso, ritorni, testo casuale,
scelta modificata, dati incompleti, risposte obsolete, provider giù e
riprova, modulo manuale, abbonamento), più i test aggiornati del menu
avatar, del profilo e della scelta del circolo.
