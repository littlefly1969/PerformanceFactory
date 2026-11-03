# Percorso dopo il riepilogo, allineato alla demo PF10

Riferimento: <https://www.murru.cloud/demo/pf10/>, dal riepilogo del funnel fino a
«Pagamento completato» incluso. La sequenza della demo è vincolante; il funnel
pre-account e il minigioco della PR #67 restano come sono.

Solo frontend (`apps/web`). Nessuna modifica a API, servizi, schema, migrazioni,
seed, configurazione persistita, autenticazione, pagamenti o webhook.

## Mappa delle schermate

| Demo | Schermata | App | Stato |
| --- | --- | --- | --- |
| S01 | Registrati | `/start` (registrazione della PR #67) | invariata; «Accedi con Apple» e «Accetto i termini» omessi (D1, D2) |
| S02 | 01 · Mettici la faccia | `/benvenuto/foto` | allineata, la classifica FIT ha ora un passo suo |
| S03 | 02 · Che classifica hai? | `/benvenuto/classifica` (nuova) | nuova, salva con `POST /athlete-journey/fit-ranking` già esistente |
| S04 | 03 · Questo sei tu. Per ora. | `/benvenuto/spider` | passo 3 di 5 |
| S05 | 04 · Il tuo regalo | `/benvenuto/regalo` | passo 4 di 5, freccia indietro |
| S06 | 05 · Sempre con te | `/benvenuto/installa` | installazione PWA al posto degli store (D6) |
| S07 | Home prima dell'assessment | `/journey` | invariata (PR #67) |
| S08-S09 | Assessment | `/journey` | invariato; conferma «Risposte registrate» resta (D5) |
| S10 | Sto calcolando la tua performance | `/journey` fase `PROCESSING` | veste scura con esagono animato |
| S11 | Profilo provvisorio pronto | `/journey` fase `EVALUATION` | veste scura, misuratore con la soglia reale |
| S12 | Home in calibrazione | `/journey` | aggiunto «Completa le sei aree» |
| S13 | Stato di calibrazione | `/journey/calibrazione` | invariato, criterio delle aree condiviso con la home |
| S14 | Lezione gratuita | `/journey/circolo` | «Dove giochi?», «Quando?», poi il riepilogo (D3) |
| S15 | Dove sei adesso e dove puoi arrivare | `/journey/stima` (nuova) | nuova, legge gli scenari già calcolati dal server |
| S16 | Scegli il tuo scenario | `/journey/scenari` | indietro porta alla rivelazione |
| S17 | Il tuo piano | `/journey/piano` | invariata |
| S18 | Checkout | `/journey/checkout` + pagina ospitata del provider | scelta attiva in lime; il metodo si sceglie sul provider (D4) |
| S19 | Pagamento completato | `/abbonamento` | nuova veste; mostrata solo con `entitled` dal backend |
| S20 | Abbandono del checkout | — | non realizzata: servirebbe un endpoint (D4) |

## Decisioni aperte (proposte solo frontend)

- **D1** Accesso con Apple: non esiste nel backend, omesso.
- **D2** «Accetto i termini di servizio»: non esiste un documento Termini, omesso.
- **D3** La lezione è una richiesta che il circolo conferma: «Ci vediamo in campo.»
  solo quando il posto è `ASSIGNED`, altrimenti «Richiesta inviata.». «Dove sei?»
  con la geolocalizzazione omesso (servirebbe l'API).
- **D4** Il metodo di pagamento si sceglie sulla pagina ospitata del provider; S20
  (abbandono) non realizzata.
- **D5** Valutazione automatica dopo l'ultima risposta, senza la conferma «Risposte
  registrate»: **non applicata**, in attesa di approvazione.
- **D6** Testi e dati reali dell'app al posto dei pulsanti degli store, delle regole
  e dei valori d'esempio della demo.

## Pagamento completato

`/abbonamento` interroga `GET /payments/subscription` ogni 2 secondi per al massimo
30 tentativi. Mostra «Il tuo piano è pronto.» solo quando il backend risponde
`entitled` con un abbonamento; il ritorno dal checkout da solo non basta. Poi crea il
programma con `POST /athlete-journey/program`, che è idempotente. Gli altri casi:

- **annullato** (`?checkout=cancel`): «Nessun addebito.», torna al checkout;
- **ancora in verifica** dopo i tentativi: «Verifica di nuovo», senza avviare un
  nuovo pagamento;
- **errore di rete**: si riprova al giro successivo;
- **sessione scaduta** (401/403): `/login`;
- **ricarica della pagina**: ricomincia la verifica, il programma non si duplica;
- **clic ripetuti** su «Prepara il tuo piano»: pulsante disabilitato durante la
  richiesta.

Importi, valute, piani, cadenze, sessioni di checkout, webhook e protezioni dai
duplicati sono quelli del backend, invariati.

## Confronto mobile

Demo a sinistra, app a destra, 390×844 con densità 2:
[1](confronto-1.jpg) · [2](confronto-2.jpg) · [3](confronto-3.jpg) ·
[4](confronto-4.jpg) · [5](confronto-5.jpg).

Le schermate dell'app dopo l'assessment usano dati d'esempio intercettati nel
browser (solo per gli screenshot); benvenuto e installazione usano l'API locale.
Nessuno scorrimento orizzontale a 390×844, 375×667 e 320×568 su tutte le
schermate del percorso. Verifiche fatte in Chromium con viewport mobile simulato,
non su dispositivi reali.

## Aggiornamento dell'installazione

Nessuna migrazione, nessun seed, nessun reset del database, nessuna variabile
d'ambiente nuova. Dopo il merge su `main` e con «Release images» verde su GitHub
Actions, dalla cartella del progetto sul server:

```bash
git pull --ff-only origin main
infra/scripts/update-prod.sh --env-file .env.production
```

Alla fine lo script stampa `Deployed sha-xxxxxxx`, con le prime 7 cifre del commit
di merge su `main`.

### Rollback

Le versioni distribuite si vedono con:

```bash
infra/scripts/update-prod.sh --env-file .env.production --list
```

Per tornare alla versione precedente (prima di questa modifica era `main` al merge
della PR #67, `sha-5288eb2`, se è quella distribuita):

```bash
infra/scripts/update-prod.sh --env-file .env.production sha-5288eb2
```

Il rollback è sicuro perché la modifica non tocca il database. I dati salvati nel
frattempo (classifica FIT, richieste di lezione, abbonamenti) usano API già
esistenti e restano validi con la versione precedente.

## Collaudo sull'installazione di test

Con il provider di pagamento in modalità test, senza addebiti reali:

1. Nuovo account dal funnel: benvenuto in 5 passi, con «Che classifica hai?» al
   passo 2; «Lo farò dopo» non salva nulla, «Continua» salva padel e tennis.
2. Ricaricare a metà benvenuto e a metà assessment: si riprende dal punto giusto.
3. Ultima risposta dell'assessment: «Sto calcolando…» in scuro, poi «Il tuo profilo
   provvisorio è pronto.» con la soglia reale.
4. Home: «Completa le sei aree» conta le stesse aree «Sufficiente» della pagina di
   calibrazione.
5. Lezione: «Dove giochi?» → «Gioco qui» → «Quando?» → consenso → «Richiedi il
   posto»; «Richiesta inviata.» finché il circolo non assegna, poi «Ci vediamo in
   campo.».
6. A calibrazione chiusa: «Dove sei adesso e dove puoi arrivare» → «Scegli il tuo
   scenario» → piano → checkout.
7. Checkout di test completato: «Confermiamo il tuo pagamento…», poi «Il tuo piano
   è pronto.» con programma, cadenza, importo e data reali.
8. Checkout annullato: «Nessun addebito.». Webhook non arrivato: «Il pagamento è
   ancora in verifica.».
9. Da telefono, app installata sulla Home: tastiera, aree sicure, modalità
   standalone.
