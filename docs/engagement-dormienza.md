# Engagement, dormienza a 10 giorni e risveglio

Riferimento: PF-FS-PREPAYWALL §8 (AT-21..24), default OP-07.

## Stati

Lo stato vive in `UserEngagement` (una riga per atleta) e dipende solo dal
tempo trascorso dall'ultima interazione significativa (`lastMeaningfulAt`),
misurato come intervallo mobile di 24 ore × giorni.

| Stato           | Regola                                         |
| --------------- | ---------------------------------------------- |
| `ACTIVE_RECENT` | fino a 7 giorni di inattività                  |
| `SLEEPY`        | oltre 7 giorni e meno di 10                    |
| `DORMANT`       | al compimento di 10 giorni (soglia inclusa)    |
| `REACTIVATED`   | nuova interazione significativa dopo `DORMANT` |

Senza interazioni dopo la registrazione, il punto di partenza è la
registrazione. Gli atleti già presenti al rilascio partono dalla loro ultima
valutazione, se esiste. Lo stato non limita mai il ritmo dell'assessment.

## Interazione significativa

Conta solo un'evidenza nuova (`recordMeaningfulInteraction`):

- `ASSESSMENT_ANSWER`: risposta valida a una domanda dell'anamnesi;
- `ASSESSMENT_SUBMITTED`: prima valutazione dell'assessment;
- `CALIBRATION_ROUND`: round di calibrazione valutato (domande o micro-test);
- `COACH_FEEDBACK`: feedback del coach incorporato nella valutazione.

Login, apertura del percorso, refresh e micro-test saltati non contano
(AT-24). Ogni interazione emette `meaningful_interaction` con la fonte, nella
stessa transazione del dato.

## Job

`EngagementWorker` esegue `EngagementService.classify()` ogni ora:

1. iscrive gli atleti attivi (`role = USER`, `isActive = true`) ancora senza
   riga;
2. porta a `DORMANT` chi ha raggiunto 10 giorni, con `user_became_dormant` e
   `wakeup_sent` (`channel: IN_APP`);
3. porta a `SLEEPY` chi ha superato 7 giorni, con `user_became_sleepy`.

Ogni passaggio è un update condizionale sullo stato di partenza: esecuzioni
ripetute o istanze parallele non duplicano eventi né risvegli (AT-22).
`ENGAGEMENT_WORKER=false` sospende il controllo; nei test non parte.

## Risveglio

Solo in-app (OP-07): finché l'atleta è `DORMANT`, `GET /athlete-journey`
restituisce `wakeup: true` e il percorso mostra un messaggio di bentornato
sopra il passo successivo, senza ricominciare il quiz. La prima interazione
significativa porta a `REACTIVATED`, registra `user_reactivated` una sola
volta e chiude il messaggio (AT-23). Email, push, quiet hours e opt-out
restano da definire (OP-07).

## Misure

`meaningful_interaction` permette di calcolare la North Star su 7 giorni,
separata dalla soglia di dormienza; le transizioni danno i tassi di
`SLEEPY`/`DORMANT` e di recupero.
