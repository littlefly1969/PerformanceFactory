# Specifica: gestione dell’account personale dal menu avatar

Stato: implementata; comportamento effettivo in
[`docs/account-personale.md`](../account-personale.md).
Analisi del 28/10/2026 su `main` al commit
`8239b569f5111dddd5180caea2da4b11ac2482e9`.

## Obiettivo e vincoli concordati

Riunire la gestione personale dell’atleta sotto il menu del proprio avatar,
con le destinazioni Foto, Tessera e classifiche FIT, Indirizzo e Abbonamento.
La stessa struttura deve essere utilizzabile durante la fase gratuita e da
abbonato, indipendentemente dall’esistenza di un programma di allenamento.

- Conservare le interfacce attuali della scelta foto e dell’editor FIT:
  impaginazione, controlli, comportamento e stili già approvati.
- Cambiare la loro collocazione e i collegamenti di navigazione. È ammesso
  estrarre componenti condivisi senza alterarne la resa visiva.
- Rielaborare soltanto il modulo indirizzo per introdurre suggerimenti e
  selezione di un indirizzo riconosciuto, nello stile Performance Factory.
- Conservare i punti di primo inserimento nel percorso iniziale di benvenuto.
- Le modifiche successive all’account devono avere un solo percorso canonico
  dal menu avatar, senza editor duplicati nelle pagine del percorso sportivo.
- Usare componenti, spaziature, tipografia, pulsanti e navigazione esistenti.
  Non introdurre un nuovo sistema grafico o riscrivere i layout dell’app.

## Cosa esiste oggi e dove

| Area | File attuali | Comportamento osservato |
| --- | --- | --- |
| Foto e primo inserimento FIT | `apps/web/app/benvenuto/foto/page.tsx`, `apps/web/app/benvenuto/foto/resize-photo.ts` | Caricamento foto con ridimensionamento, editor FIT e prosecuzione verso `/benvenuto/spider`. |
| Profilo nella fase gratuita | `apps/web/app/journey/profilo/page.tsx` | Mescola Spider, calibrazione e lezione gratuita con indirizzo e FIT; avatar e menu impostazioni rimandano al benvenuto per cambiare foto. |
| Profilo nell’area utente | `apps/web/app/user/profile/page.tsx` | Mescola programma, disponibilità, coach e preferenze con gli stessi editor indirizzo e FIT. |
| Avatar della home abbonato | `apps/web/app/user/page.tsx` | Mostra un’iniziale e porta a `/user/profile`; non offre un menu account condiviso. |
| Layout e navigazione | `apps/web/app/journey/_account/account-shell.tsx`, `apps/web/app/user/_components/athlete-shell.tsx`, `apps/web/app/user/_components/subscriber-shell.tsx` | Il profilo ha ingressi diversi nelle varie fasi; manca una gestione account unica. |
| Editor FIT riutilizzabile | `apps/web/app/components/fit-ranking-editor.tsx`, `apps/web/app/components/fit-ranking.css` | Contiene classifiche attuali/migliori di padel e tennis, numero di tessera facoltativo, sintesi e modifica. |
| Indirizzo attuale | `apps/web/app/components/athlete-address.tsx`, `apps/api/src/athlete/athlete-address.ts` | Quattro campi liberi; il backend può salvare il testo anche senza riuscire a riconoscerlo. |
| Geocoding attuale | `apps/api/src/geo/geocoding.service.ts` | Usa Nominatim dopo l’invio del modulo; nessun autocompletamento e nessuna prova della selezione di un suggerimento. |
| Richiamo all’indirizzo dai circoli | `apps/web/app/journey/circolo/page.tsx` | Rimanda a `/journey/profilo#indirizzo`, che diventerebbe obsoleto dopo lo spostamento. |
| Dati abbonamento | `apps/api/src/payments/payments.controller.ts`, `apps/api/src/payments/subscriptions.service.ts` | Espone stato, durata, cadenza, prezzo, date e disdetta; sono già presenti le API di disdetta e revoca. |
| Pagina `/abbonamento` | `apps/web/app/abbonamento/page.tsx` | È il ritorno dal checkout e attende il webhook; non è una pagina di gestione del contratto. |

La lettura dell’abbonamento corrente cerca attualmente solo gli stati ACTIVE,
PAYMENT_GRACE e PAUSED. Una vista dell’ultimo abbonamento terminato richiede
una lettura aggiuntiva, mantenendo invariata la decisione sull’accesso pagato.

## Navigazione proposta

Percorso canonico proposto:

- avatar → Foto → `/account/foto`;
- avatar → Tessera e classifiche FIT → `/account/fit`;
- avatar → Indirizzo → `/account/indirizzo`;
- avatar → Abbonamento → `/account/abbonamento`.

I nomi tecnici dei percorsi possono essere adattati alle convenzioni del
repository, ma deve esistere una sola destinazione per ogni funzione.
Il menu usa la foto reale quando presente e il fallback attuale altrimenti.
La navigazione deve funzionare con tastiera, touch e lettori di schermo.

Il profilo sportivo rimane raggiungibile dalla navigazione esistente per
Spider, risultati, calibrazione, programma e coach. Il trasferimento riguarda
gli editor personali elencati, non la rimozione del profilo sportivo.
Disponibilità di allenamento, preferenze marketing e referral non devono
sparire o essere ridisegnati incidentalmente durante il riordino.

### Percorso iniziale e ritorni

- Conservare il benvenuto e la sua sequenza di primo inserimento foto/FIT.
- Dopo il benvenuto, cambiare la foto dall’account non deve rimandare allo
  Spider del benvenuto, al regalo o all’avvio di un nuovo assessment.
- La navigazione Indietro e il salvataggio devono riportare al contesto
  account o alla pagina chiamante prevista, senza perdere lo stato sportivo.
- Le pagine del flusso che richiedono un dato possono mostrare un richiamo
  al percorso canonico; non devono incorporare un secondo editor.
- In particolare, dalla scelta circolo è ammesso «Completa l’indirizzo nel
  tuo account», con ritorno alla scelta circolo e aggiornamento delle distanze.
  L’unico editor resta quello dell’account.
- Riconciliare vecchi link e frammenti, inclusi `#indirizzo`, con redirect o
  navigazione compatibile, senza pagine vuote o rientri nel benvenuto.
- I ritorni devono essere destinazioni interne consentite, evitando redirect
  arbitrari verso URL forniti dal client.

Le nuove pagine devono richiedere autenticazione e consensi applicabili, ma
non essere subordinate a un abbonamento, a un programma o a una specifica
fase dell’assessment. Verificare `apps/web/proxy.ts`, i controlli di percorso
in `ProductShell` e gli hook di navigazione prima di riusarli:
`useAccountJourney()` oggi rimanda a `/journey` le fasi non gratuite.
Restano fuori da questa specifica gli account degli atleti gestiti dal coach
e una riprogettazione delle aree amministratore/professionista.

## Foto e tessera FIT: ricollocazione con interfaccia invariata

Riutilizzare la schermata foto e l’editor FIT attuali. Il componente foto può
essere condiviso tra contenitore di benvenuto e contenitore account, con le
sole differenze di navigazione richieste dal contesto.

Conservare caricamento, ridimensionamento, formati e limiti della foto;
conservare tutti i dati FIT, incluse classifiche attuali/migliori e tessera.
Non aggiungere una nuova versione grafica dei due editor.

Conservare gli effetti funzionali del salvataggio FIT: blocco durante il
lease AI, rigenerazione della banca quando necessaria prima della prima
valutazione, ricalcolo della R e gestione del ricalcolo pendente dopo.
Aggiornare foto e dati mostrati nelle altre viste senza richiedere un nuovo
login. Il salvataggio dell’indirizzo deve aggiornare le distanze dei circoli.

## Indirizzo assistito

### Servizio proposto

Soluzione preferita: Google Places API (New), con Autocomplete (New) per i
suggerimenti e Place Details (New) per risolvere la selezione. La scelta
recepisce la preferenza del committente per Google. Non richiede una mappa
nell’interfaccia: il campo e la lista suggerimenti possono mantenere lo stile
Performance Factory, con le attribuzioni Google richieste dal servizio.

Prerequisiti di configurazione per chi implementerà: progetto Google Cloud,
fatturazione abilitata, Places API (New) abilitata e credenziale limitata ai
servizi necessari. Preferire chiamate REST dal backend con chiave lato server
e restrizioni appropriate, senza inserirla nel bundle web o commetterla.
Documentare configurazione, quote e monitoraggio dei consumi. Gli avvisi di
budget non sono da presentare come un blocco automatico della spesa.

Usare un token distinto per ogni sessione di ricerca, condiviso dalle chiamate
Autocomplete e dalla successiva risoluzione della selezione; non riusarlo
dopo la conclusione. Richiedere soltanto i campi necessari mediante field mask,
per esempio identificativo, indirizzo strutturato/formattato e posizione.
Non attivare altre API o servizi Google senza necessità per questo perimetro.

Non usare l’endpoint pubblico Nominatim per l’autocompletamento: la relativa
policy lo vieta. Nominatim e Google hanno risposte diverse; sostituire
semplicemente `GEOCODING_URL` romperebbe il parser attuale. Prevedere un
adattatore per i suggerimenti e per la normalizzazione dell’indirizzo,
preservando il geocoding già usato da circoli e seed.

Le richieste del browser devono passare dal backend applicativo, con
limitazione della frequenza e cancellazione/gestione delle risposte obsolete.
La CSP attuale non ammette connessioni dirette ai servizi Google Places.
Evitare di registrare indirizzi completi e credenziali nei log di routine.

Rispettare le regole Google per attribuzione, dati dell’indirizzo scelto
dall’utente, conservazione dei place ID e degli altri dati, incluse le
coordinate. Non introdurre una cache persistente indiscriminata dei
suggerimenti o delle risposte Places. Documentare quali dati sono forniti e
confermati dall’utente, quali derivano dal provider e le eventuali scadenze
di aggiornamento. Questa specifica non presume che tutto il contenuto Google
possa essere archiviato senza limiti.

### Comportamento richiesto

- Campo di ricerca con suggerimenti accessibili e debounce, nello stile
  attuale del prodotto; non ridisegnare le altre pagine account.
- Mantenere il perimetro Italia già previsto dal backend, salvo diversa
  indicazione del committente. Normalizzare via, numero civico, CAP, comune,
  provincia e coordinate nel formato richiesto dall’app.
- L’utente seleziona un risultato riconosciuto. Il salvataggio deve collegare
  i dati a un risultato effettivamente ottenuto dal backend; non fidarsi di
  un flag `verified` o di coordinate liberamente inviate dal browser.
- Modificare il testo o i campi strutturati dopo la selezione invalida la
  selezione precedente e richiede un nuovo riscontro.
- Un comune, un punto di interesse o una via senza i dati necessari non deve
  essere spacciato per un indirizzo completo. Non inventare civici, CAP o
  sigle di provincia mancanti. La selezione non prova la residenza dell’utente.
- Se il servizio non restituisce un indirizzo completo e coerente, mostrare
  uno stato esplicito e impedire il salvataggio del nuovo testo come indirizzo
  verificato. Non convertire il fallimento in un successo con coordinate nulle.
- Durante indisponibilità del servizio conservare il valore precedente e
  la bozza dell’utente, offrendo un nuovo tentativo. Il resto del percorso
  deve restare utilizzabile anche senza un indirizzo salvato.
- Conservare gli indirizzi esistenti. Non attribuire retroattivamente una
  verifica forte ai dati storici: richiedere la nuova selezione quando vengono
  modificati, senza cancellazioni automatiche o blocchi dell’account.
- Prevedere eventuali campi di provenienza/verifica con migrazioni additive,
  mantenendo compatibile `UserAddress` e il calcolo delle distanze.

## Abbonamento nell’account

Creare una pagina account coerente con i layout esistenti che mostri i dati
effettivi dell’abbonamento: stato, durata del programma, cadenza, importo e
valuta, inizio e scadenza del periodo, prossimo addebito quando previsto,
disdetta a fine periodo e date del programma quando disponibili.

Usare descrizioni comprensibili e non presentare campi assenti come dati
confermati. Non inventare fatture, dettagli della carta o storico degli
addebiti non esposti dalle API esistenti.

Gestire distintamente assenza di abbonamento, contratto attivo, pagamento
in verifica, periodo di tolleranza, sospensione e contratto terminato. Per
mostrare l’ultimo contratto terminato può essere aggiunta una vista di lettura
per l’account, senza cambiare il significato di `entitled` usato dal checkout
e dal programma. Non confondere una sospensione con una nuova disponibilità
di acquisto.

Rendere accessibili disdetta e revoca quando consentite dalle API attuali,
con conferma dell’azione e le stesse scadenze, senza cambiare prezzi o regole
commerciali. La pagina `/abbonamento` resta il ritorno tecnico dal checkout.
Chi non è abbonato vede uno stato chiaro; eventuali richiami di attivazione
rispettano l’eleggibilità e le fasi già previste, senza anticipare il paywall.

## Criteri di accettazione per l’implementazione successiva

- [x] Menu avatar coerente nelle aree gratuite e abbonate e nelle pagine di dettaglio interessate.
- [x] Quattro destinazioni canoniche: Foto, FIT, Indirizzo, Abbonamento.
- [ ] Foto e FIT mantengono le interfacce attuali: nessun ridisegno, confronto visivo mobile/desktop.
- [x] Primo inserimento nel benvenuto conservato; modifica successiva senza rientrare nel benvenuto.
- [x] Editor FIT e indirizzo rimossi dai profili sportivi, senza rimuovere risultati, coach o altre funzioni.
- [x] Vecchi link, accessi diretti, ritorni e richiamo dalla scelta circolo riconciliati.
- [x] Account utilizzabile da utente autenticato prima del pagamento, senza saltare consensi o onboarding obbligatorio.
- [x] Autocompletamento italiano con selezione riconosciuta e verifica anche sul backend.
- [x] Configurazione Google Cloud/Places documentata, chiave protetta, session token e field mask corretti.
- [x] Attribuzioni e conservazione dei dati del provider gestite senza cambiare lo stile delle altre schermate.
- [x] Test per testo casuale, selezione modificata, dati incompleti, risposte obsolete, timeout e provider non disponibile.
- [x] Dati FIT conservati e test dei lease/ricalcoli invariati; foto aggiornata negli avatar.
- [x] Indirizzi storici preservati e distanze aggiornate dopo un salvataggio valido.
- [x] Abbonamento con dati reali, stati espliciti e azioni consentite; ritorno checkout e diritto di accesso invariati.
- [x] Test di navigazione per fase gratuita, assessment in corso, abbonato e assenza di programma.
- [x] Nessuna modifica a pannelli amministrativi, prezzi, acquisti o programmi estranea al perimetro richiesto.
- [ ] Documentazione aggiornata, controlli pertinenti e CI della futura implementazione verdi.

Questa PR di specifica non deve essere presentata come funzionalità già
realizzata: l’implementazione e i relativi test saranno aggiunti da chi
prenderà in carico il lavoro.

## Fonti del servizio di indirizzo

- Configurazione Google Places: https://developers.google.com/maps/documentation/places/web-service/get-api-key
- Autocomplete (New): https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
- Sessioni: https://developers.google.com/maps/documentation/places/web-service/place-session-tokens
- Fatturazione: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Policy e attribuzioni: https://developers.google.com/maps/documentation/places/web-service/policies
- Policy del servizio pubblico Nominatim: https://operations.osmfoundation.org/policies/nominatim/
