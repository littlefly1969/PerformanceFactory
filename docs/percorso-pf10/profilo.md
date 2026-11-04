# Profilo della fase gratuita, allineato alla demo PF10

Riferimento: la schermata «Profilo» della demo <https://www.murru.cloud/demo/pf10/>,
raggiunta dal pulsante flottante con l'omino. Nell'app è `/journey/profilo`.

## Mappa delle schermate

| Demo | App | Note |
| --- | --- | --- |
| Profilo prima dell'assessment | `/journey/profilo` | esagono vuoto con «Inizia/Continua l'assessment» |
| Profilo in calibrazione | `/journey/profilo` | R, chip «Profilo provvisorio», pannello «i», lezione, disponibilità e classifica da compilare, sei aree, «Fase gratuita · Calibrazione», analisi, disponibilità e classifica compilate, invito, community (l'ordine della demo) |
| La tua disponibilità | `/journey/profilo/disponibilita` (nuova) | frequenza, giorni della settimana, durata della sessione |
| La tua classifica FITP | `/journey/profilo/classifica` (nuova) | padel, livello Playtomic, tennis, tessera |
| Invita un amico | `/journey/profilo/invita` (nuova, finta) | attiva solo la freccia indietro |
| Community | `/journey/profilo/community` (nuova, finta) | attiva solo la freccia indietro |

In calibrazione non c'è il calendario: al suo posto «Analisi delle sei aree» porta a
`/journey/calibrazione`.

## Regole

- **Linea piena o tratteggiata.** Un'area è definita quando la sua confidenza
  raggiunge la soglia minima delle aree (lo stesso criterio di home e calibrazione).
  Nell'esagono un lato è pieno solo se entrambe le aree agli estremi sono definite;
  gli anelli delle sei aree hanno l'arco pieno lungo quanto la confidenza, lime se
  definite e grigio se no, come nella demo. Le etichette dell'esagono mostrano il
  margine della demo («70 ±8»): metà intervallo pari al 20% della scala a confidenza
  zero, che si stringe con la confidenza (la stessa ampiezza della R globale); sotto
  i 3 punti resta solo il valore.
- **Fase gratuita.** La scheda nera mostra «Calibrazione in corso» (o «Calibrazione
  completata» con R consolidata) e la pillola corta «Calibrazione»; a fase chiusa
  porta agli scenari. Con la lezione sbloccata la scheda resta sulla calibrazione:
  al circolo porta la scheda lime della lezione.
- **Lezione gratuita.** Bloccata: anello con le aree già Reali («2/6») e «Rendi
  Reali tutte e sei le aree per sbloccarla.»; si sblocca solo quando lo sono tutte. Sbloccata: «Scegli il circolo». Richiesta o
  assegnata: data, circolo, oppure «Richiesta inviata». Senza circoli in zona: «Non
  ancora disponibile nella tua zona.».
- **Disponibilità.** Si salva già in fase gratuita, prima del programma (basta aver
  iniziato l'assessment). Le voci salvate dal profilo sono marcate `source:
  "profile"` e alla creazione del programma (e nella validazione dell'obiettivo)
  valgono sulle risposte congelate del funnel e dell'assessment: frequenza, giorni,
  minuti e giorni preferiti restano quelli scelti nel profilo. Se giorni e durata
  mancano ancora al checkout, li chiede il passo in linea della PR #71; questa
  pagina resta il posto dove modificarli dopo.
- **Classifica e Playtomic.** Il livello Playtomic va da 0 a 7 con al massimo due
  decimali; si può scrivere con la virgola o sceglierlo da una delle 7 fasce della
  demo. Cambiarlo fa ricalcolare la R come gli altri campi della classifica.

## Differenze dalla demo

- Durate della sessione: i 5 valori che il server accetta (30, 45, 60, 90, 120+),
  non gli intervalli della demo.
- La lezione si sblocca con tutte le aree Reali, non con «70 di calibrazione»: è il
  testo del regalo («completamente Reale … niente più tratteggio»).
- Il margine «±» di ogni area è calcolato nel browser dalla confidenza dell'area
  (l'API non lo dà per area), con la stessa regola dell'intervallo di R globale.
- Invito e community non hanno persone o codici veri: il codice d'esempio deriva dal
  nome e tutti i pulsanti sono disattivati.

## Confronto mobile

Demo a sinistra, app a destra, 390×844 con densità 2, con dati d'esempio intercettati
nel browser: [intro](confronto-profilo-1.jpg) · [profilo](confronto-profilo-2.jpg) ·
[disponibilità](confronto-profilo-3.jpg) · [classifica](confronto-profilo-4.jpg).

## Aggiornamento dell'installazione

Una migrazione: `20261103233000_playtomic_level` aggiunge la colonna facoltativa
`playtomicLevel` ad `AthleteFitRanking`. Nessun seed, nessuna variabile d'ambiente
nuova. Lo script di aggiornamento esegue le migrazioni dopo un dump del database.

Dopo il merge su `main` e con «Release images» verde su GitHub Actions, dalla
cartella del progetto sul server:

```bash
git pull --ff-only origin main
infra/scripts/update-prod.sh --env-file .env.production
```

Alla fine lo script stampa `Deployed sha-xxxxxxx`, con le prime 7 cifre del commit di
merge su `main`.

### Rollback

```bash
infra/scripts/update-prod.sh --env-file .env.production --list
infra/scripts/update-prod.sh --env-file .env.production sha-<precedente>
```

Il rollback è sicuro: la versione precedente ignora la nuova colonna, che è
facoltativa. I livelli Playtomic salvati nel frattempo restano nel database.
