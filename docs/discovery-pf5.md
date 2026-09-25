# Discovery PF5: esperienza pre-account

## Risultato

Dopo l'ultima risposta della discovery l'atleta vede una schermata di analisi di
almeno 4 secondi. Segue la pagina pre-account PF5: offerta della prova gratuita,
vincoli dichiarati e CTA **Attiva la prova gratuita**, che porta alla
registrazione. L'account non viene creato automaticamente.

```
/start → intro → domande visibili → analisi ≥ 4 s → risultato PF5
       → Attiva la prova gratuita → registrazione → AthleteDiscovery
```

Il numero di domande non è fisso: resta quello dei template `DISCOVERY` attivi,
filtrati dalle condizioni di visibilità (`visibleQuestions()`).

## Analisi

`AnalysisTransition` (`apps/web/app/start/analysis-transition.tsx`) è una
transizione di interfaccia, **non** una valutazione AI. Il passaggio al risultato
avviene dopo `DISCOVERY_ANALYSIS_MIN_DURATION_MS` (4000 ms), con un timer che non
dipende dalla velocità del dispositivo. Nella stessa pagina scorrono tre fasi:

| Tempo | Messaggio |
|---|---|
| 0 s | Analizziamo le tue risposte… |
| 1,3 s | Organizziamo il tuo profilo… |
| 2,6 s | Prepariamo il tuo punto di partenza… |

Quando esisterà un'analisi server-side la durata diventerà
`max(4000 ms, durata elaborazione)`. Con `prefers-reduced-motion` la barra di
avanzamento compare già piena, ma l'attesa minima resta.

## Pagina risultato

Durante analisi e risultato l'header mostra **MISURE**. `PreliminaryResult`
separa due contenuti.

- **Riquadro giallo: offerta commerciale.** «Premio sbloccato», «7 giorni gratis»
  (con «7» e «giorni gratis» in elementi separati, per la gerarchia visiva PF5),
  «Assessment, programma e analisi dei sei driver. Tutto sbloccato da subito.»,
  «Nessuna carta», «Disdici quando vuoi». Il testo è statico e non usa le
  risposte della discovery.
- **Sotto: i vincoli dell'atleta.** «Questi sono i tuoi vincoli.» e le misure
  dichiarate.
  - Il BMI si calcola dalle risposte con `contextKey` `general_height_cm` e
    `general_weight_kg`. Mostra la fascia OMS (sottopeso < 18,5, normopeso < 25,
    sovrappeso < 30, obesità) e una scala da 15 a 40. È un indicatore
    preliminare, non il Performance Index.
  - Senza altezza o peso il BMI non compare.
  - Seguono obiettivo, sport e le altre risposte visibili. Altezza e peso non
    si ripetono, perché sono già rappresentati dal BMI.

## Persistenza invariata

Prima dell'account la bozza resta in `sessionStorage`. La registrazione invia
`discovery: draft` e il backend salva in `AthleteDiscovery` sia la bozza sia la
configurazione esatta usata. Una modifica successiva delle domande non
reinterpreta le discovery già salvate. Assessment e generazione training
continuano a consumare `answersJson`, `profileJson` e snapshot come prima.

## Verifica

`apps/web/app/start/page.test.tsx` usa fake timers e copre:

- l'analisi ancora visibile a 3999 ms, le tre fasi e il risultato a 4000 ms,
  con l'header MISURE in entrambi i passi;
- offerta separata dai dati dell'atleta;
- BMI 27,8 «Sovrappeso» per 180 cm e 90 kg;
- righe obiettivo, sport ed esperienza;
- BMI assente senza misure;
- CTA verso la registrazione.

Il conteggio dei passaggi sui soli rami visibili resta coperto dai test esistenti
sui rami condizionali.
