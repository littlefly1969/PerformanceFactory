# Area abbonati come la demo V11 e ranking PF1–PF4

Punto 4 dell'analisi della demo V10/V11. Il ranking è una funzione nuova, fuori
dal Product Blueprint, con le regole decise da Stefano il 13/11/2026.

## Profilo dell'abbonato (`/user/profile`)

Rifatto come il profilo con il piano attivo della demo V11, con le stesse parti
del profilo della fase gratuita:

- testata scura con l'esagono delle sei aree, R e il pannello «i» («Stima
  stabile» a calibrazione chiusa);
- riga del ranking («PF4 · 395° in PF4 · Reale 30 · potenziale 61») che apre
  `/user/ranking`;
- disponibilità e classifica FITP da compilare in alto, compilate in fondo. Le
  pagine di modifica sono quelle del profilo gratuito, aperte con
  `?da=abbonato`: indietro e salvataggio tornano a `/user/profile`;
- le sei aree (ognuna apre `/user/areas/<id>`);
- «Abbonamento attivo · Programma di N mesi · pagamento …» con «Gestisci» verso
  `/account/abbonamento`;
- piano: versione e orizzonte, «Obiettivi misurabili», settimana del blocco,
  sessioni della settimana, serie di giorni con il link al calendario;
- analisi delle sei aree, coach, invito, community e in fondo le preferenze
  (nome nel ranking, comunicazioni, link di invito se `referral_share` è acceso).

La barra in basso è quella dell'area abbonati: Home, Calendario, Profilo. Il
vecchio modulo «disponibilità» del profilo è stato tolto: la disponibilità si
modifica dalla pagina del profilo gratuito.

## Regole del ranking

| Voce | Regola |
|---|---|
| Chi entra | Atleti (`USER` attivi) con un abbonamento che dà accesso al programma (attivo o in tolleranza), una valutazione e gli scenari P dell'orizzonte pagato |
| Reale | R globale dell'ultima valutazione (media delle aree pesata sulla confidenza), riportato a 0-100 dalla scala di quella valutazione |
| Potenziale | P dell'orizzonte pagato (abbonamento più recente con accesso), dagli scenari più recenti, aggregato come R e riportato a 0-100 dalla scala della valutazione da cui sono nati gli scenari; non scende sotto il reale |
| Punteggio | 0-100: media pesata 60 % reale e 40 % potenziale, entrambi già su 0-100 |
| Fasce | PF1 da 80, PF2 da 66, PF3 da 50, sotto PF4 |
| Posizione | dentro la fascia, per punteggio; a parità il reale più alto (su 0-100), poi l'id |

Scala unica: reale e potenziale si normalizzano ciascuno con la scala della
propria valutazione (gli scenari possono venire da una valutazione precedente
con un'altra scala) prima del confronto «il potenziale non scende sotto il
reale», del punteggio e dello spareggio. Schermate e API mostrano gli stessi
numeri 0-100 arrotondati: con una valutazione su 0-10, R 7,5 nel profilo è
«Reale 75» nel ranking.

Pesi e soglie si cambiano in `/admin/ranking` (menu «Ranking»): i pesi sommano
100, le soglie scendono da PF1 a PF3. Ogni salvataggio scrive
`RankingConfigChange` con autore, prima e dopo. Senza riga in `RankingConfig`
valgono 60/40 e 80/66/50.

Il ranking si calcola a ogni lettura su tutti gli abbonati: per i numeri
dell'MVP basta, quando crescono va salvato a ogni nuova valutazione.

## Privacy

Consenso facoltativo `RANKING_VISIBILITY` (versione `ranking-v1-2026-11-13`,
testo in `apps/api/src/ranking/ranking-consent.ts`): con il consenso gli altri
vedono nome e iniziale del cognome («Sara P.»), senza vedono «Atleta». Posizione,
reale e potenziale restano visibili anche senza nome. Si dà o si toglie dal
profilo o dalla schermata del ranking. Sotto la casella «Leggi il testo
completo» apre titolo, testo e versione del documento restituito da
`GET /athlete/ranking/visibility`; la casella si attiva solo quando il
documento è arrivato, così il consenso registrato è sempre su un testo che
l'atleta ha potuto leggere.

## Schermate

- **Pop-up «Sei entrato in PFx.»** sul profilo, alla prima fascia dopo il
  pagamento e a ogni cambio di fascia (`RankingAnnouncement` tiene l'ultima
  annunciata). Chiudi o «Vedi il ranking» lo segnano come visto.
- **Ranking della piattaforma** (`/user/ranking`): fascia, posizione «su N
  giocatori», reale e potenziale, i due atleti sopra e i due sotto, l'esempio
  «numeri simili, fasce diverse» calcolato con i pesi e le soglie di oggi, le
  quattro fasce con il numero di atleti.

Differenze volute dalla demo: il testo non cita la «costanza» (non è nel
calcolo) e non promette aggiornamenti «a ogni allenamento»; l'esempio
Luca/Anna usa numeri coerenti con le regole (con 60/40 i numeri della demo
finirebbero entrambi in PF2) e non mostra posizioni inventate.

## API

| Endpoint | Chi |
|---|---|
| `GET /athlete/ranking` | atleta: `OFF`, `NOT_RANKED` (con `subscribed`) o `RANKED` |
| `POST /athlete/ranking/announcement` | atleta, `{ band }`: pop-up mostrato |
| `GET`/`PUT /athlete/ranking/visibility` | atleta, `{ granted }` |
| `GET /admin/ranking` | admin: configurazione, fasce di oggi, storico |
| `PUT /admin/ranking/config` | admin: pesi e soglie |

## Rilascio

Flag `platform_ranking`, nato spento: senza flag la riga, il pop-up e la
schermata non compaiono. Si accende da `/admin/feature-flags`, prima per i
beta tester.
