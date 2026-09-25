# Gestione admin della discovery

## Risultato

L'amministratore gestisce le domande della discovery pubblica in
`/admin/discovery`. Può creare, modificare, duplicare, attivare/disattivare,
eliminare e riordinare le domande, configurare opzioni, numeri, scale, context key
e condizioni di visibilità, e provare il percorso reale in anteprima.

Non esiste un secondo modello di domande. Admin e `/start` leggono gli stessi
`OnboardingQuestionTemplate` con scope `DISCOVERY` e lo stesso `optionsJson`:

```
/admin/discovery → OnboardingQuestionTemplate → DiscoveryService → /start
```

L'editor viveva in `/ai-tuner/discovery`: ora c'è un solo editor, nell'area
amministrazione. Gli endpoint `/ai-tuning/onboarding-templates` restano per
l'anamnesi dell'AI Tuner.

## Numeri derivati

Il numero di domande non è un campo: lo calcola il server dai template.

| Conteggio | Significato |
|---|---|
| Configurate | tutti i template discovery |
| Attive | template attivi |
| Sempre visibili | attivi nel percorso pubblico, senza condizione |
| Condizionali | attivi nel percorso pubblico, con `visibleWhen` |
| Percorso massimo | attivi nel percorso pubblico, condizionali comprese |

Con `PF4_SPORT_MODE=fixed` sport e specializzazione restano fuori dal percorso
pubblico e non entrano negli ultimi tre conteggi. Il percorso massimo non è il
numero che vede ogni atleta: rami alternativi possono escludersi a vicenda.

## Regole che l'admin non può rompere

Ogni salvataggio, eliminazione e riordino valida la discovery risultante prima di
scrivere:

- una condizione può dipendere solo da una domanda attiva **precedente**, quindi
  niente cicli né riferimenti futuri;
- i valori di una condizione devono esistere e avere il tipo della domanda
  genitore (opzione, booleano, numero o data ISO);
- non si elimina una domanda usata in una condizione, anche di una domanda
  disattivata;
- c'è una sola domanda attiva per target (sport, specializzazione, obiettivo) e
  l'obiettivo è obbligatorio;
- con sport a scelta servono sport e specializzazione, con lo sport prima.

Le ultime due regole prima si verificavano solo alla lettura pubblica: un
salvataggio poteva lasciare `/start` in errore 503. Ora
`assertDiscoveryStructure()` le applica anche all'admin. Non si applicano ai
template di altri scope, così l'anamnesi dell'AI Tuner non viene bloccata da una
discovery già incoerente.

Prima di inviare un riordino l'interfaccia ripete il controllo delle dipendenze
e spiega il problema con i titoli, per esempio: «Impossibile spostare "Dettaglio
infortunio" prima di "Hai avuto infortuni?"».

## API

Tutte le rotte richiedono il ruolo `ADMIN`.

| Metodo e percorso | Effetto |
|---|---|
| `GET /admin/onboarding-templates?scope=DISCOVERY` | `{ sportMode, templates, stats }` |
| `POST /admin/onboarding-templates` | crea; senza `orderIndex` la domanda va in fondo |
| `PATCH /admin/onboarding-templates/:id` | modifica parziale; il codice (`key`) non cambia |
| `DELETE /admin/onboarding-templates/:id` | elimina una domanda non referenziata |
| `POST /admin/onboarding-templates/reorder` | `{ ids }` con tutti gli ID nel nuovo ordine |

Il riordino gira in una transazione e assegna 10, 20, 30…. Valida grafo e
struttura sull'ordine completo prima di scrivere: un ordine invalido non modifica
nulla.

## Editor

- **Codice.** Si sceglie alla creazione e poi resta fisso, perché le condizioni
  lo referenziano.
- **Tipo.** Scelta singola, Scelta multipla, Numero, Scala, Sì / No, Data: gli
  enum Prisma non compaiono. Si sceglie solo alla creazione.
- **Opzioni.** Hanno ID, etichetta, valore (se vuoto, uguale all'etichetta) e
  descrizione, e si ordinano con **Sposta su/giù**. Gli ID già salvati restano
  fissi, perché risposte storiche e condizioni li usano.
- **Numero e scala.** Minimo, massimo, incremento e unità (`ui.unit`).
- **Duplica.** Crea una copia disattivata e senza target, subito dopo
  l'originale. Sport e specializzazione non si duplicano, perché le loro opzioni
  vengono dal catalogo.

Ogni salvataggio è subito operativo per i nuovi atleti. Chi ha già completato la
discovery conserva in `AthleteDiscovery` la configurazione che ha usato, quindi
una modifica non reinterpreta i percorsi esistenti. Un flusso bozza → anteprima →
pubblica richiederebbe il versioning della configurazione e resta fuori da
questa slice.

## Anteprima

**Anteprima discovery** apre `/admin/discovery/preview` in una nuova scheda.
Usa la configurazione pubblica reale e lo stesso motore di `/start`:
`DiscoveryQuestionRenderer`, `visibleQuestions`, `answerValid`, `optionsFor` e
la potatura dei rami nascosti. Mostra il passo corrente, le domande visibili nel
ramo e, quando una risposta apre o chiude un ramo, la variazione (per esempio
«Domande visibili: 3 → 4»). L'anteprima usa **Avanti** anche per le scelte che in
`/start` avanzano da sole, così si vede l'effetto di ogni risposta sul percorso.

## Verifica

- **API unit** (`src/admin/admin-discovery.spec.ts`): conteggi in modalità fixed
  e user_choice; riordino con dipendenza violata, ID mancanti o duplicati e sport
  dopo la specializzazione; nessuna scrittura su un riordino invalido; creazione
  in fondo con metadati numerici; codice duplicato; seconda domanda obiettivo;
  condizione numerica con stringhe; disattivazione parziale; obiettivo
  obbligatorio; condizione su domanda successiva; genitore referenziato non
  eliminabile; rotte limitate a DISCOVERY.
- **API e2e** (`test/admin-discovery.e2e-spec.ts`): ruolo, scope, conteggi,
  riordino atomico, validazione del body, `PATCH` senza campi fuori contratto,
  eliminazione protetta.
- **Web** (`app/admin/discovery/*.test.tsx`): conteggi, disattivazione,
  trascinamento, blocco leggibile del riordino, editor numero e opzioni, builder
  delle condizioni, errore del backend, duplica ed eliminazione con conferma,
  anteprima con variazione del numero di domande.
- **Contratto OpenAPI** aggiornato: 149 operazioni.
