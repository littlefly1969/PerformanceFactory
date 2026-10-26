# Classifica FIT

## Cosa chiede

La classifica non è una domanda dell'assessment: è un dato di configurazione del
profilo, come la foto. Si dichiara in un riquadro compatto, tutto in una
schermata:

1. classifica FIT di padel, attuale e migliore di sempre;
2. classifica FIT di tennis, attuale e migliore di sempre;
3. numero di tessera FIT, facoltativo (compare solo se lo si chiede).

«Non ho classifiche» la dichiara tutta in un tocco. È sempre facoltativa: senza
dichiarazione i prompt ricevono `fitRanking: null`.

Padel e tennis hanno classifiche separate. Le liste sono chiuse, dalla più alta
alla più bassa, e finiscono con «Nessuna classifica»:

| Sport | Valori |
|---|---|
| Padel | 1ª, 2ª, 3ª, 4ª fascia, fascia non agonistica |
| Tennis | 1ª categoria, 2.1–2.8, 3.1–3.5, 4.1–4.6, 4.NC |

La migliore di sempre non può essere più bassa dell'attuale: la lista della
migliore arriva fino all'attuale, e se l'atleta alza l'attuale la migliore già
data sale con lei. Le liste sono in `FIT_RANKING_OPTIONS`
(`apps/api/src/discovery/fit-ranking/fit-ranking.ts`).

Il riquadro (`apps/web/app/components/fit-ranking-editor.tsx`) compare nella
schermata della foto del benvenuto (`/benvenuto/foto`), nel profilo del percorso
(`/journey/profilo`) e nel profilo dell'atleta (`/user/profile`). La classifica
non dà punteggio e non entra nelle risposte dell'onboarding.

## Dove si salva

`AthleteFitRanking` è uno storico a soli inserimenti: l'ultima riga è la
classifica in vigore. Una riga nuova nasce a ogni dichiarazione dell'atleta
(fonte `PROFILE`; le righe `JOURNEY` restano quelle dichiarate quando la
classifica era parte del percorso); una dichiarazione identica all'ultima non
crea righe. Se la classifica cambia prima della prima valutazione, le domande
dei driver già scritte dall'AI si cancellano e vengono riscritte. Mentre l'AI
scrive le domande o fa la prima valutazione (lease `AthleteDiscovery.operationAt`)
la classifica non si può cambiare: l'API risponde 409 e si riprova dopo. La
migrazione `20261026160000_fit_ranking_out_of_journey` toglie le vecchie risposte
`fit:*` dai percorsi in corso e riallinea il loro cursore alla nuova sequenza. La classifica
è copiata anche in `UserOnboardingAssessment.profileJson.fit_ranking`, il
profilo letto dal coaching.

## Chi la usa

Ogni prompt dell'assessment riceve `fitRanking`: domande conoscitive iniziali
dei driver, valutazione della R,
domande di calibrazione, micro-test e scenari P3/P6/P12. Il coaching la legge dal
profilo. Ai prompt arrivano solo le etichette leggibili e la data della
dichiarazione: **mai il numero di tessera**. Una regola fissa
(`FIT_RANKING_RULE`) si aggiunge ai prompt anche quando l'AI Tuner ha attivato
un testo che non cita la classifica; i prompt predefiniti la citano anche nel
testo modificabile.

## Correzione e ricalcolo della R

L'atleta corregge la classifica quando vuole, dal profilo del percorso
(`/journey/profilo`) o dal profilo dell'atleta (`/user/profile`).

| Endpoint | Cosa fa |
|---|---|
| `GET /athlete-journey/fit-ranking` | classifica in vigore, liste dei valori, `recalculationPending` |
| `POST /athlete-journey/fit-ranking` | salva la correzione e, se una classifica è cambiata dopo una valutazione, ricalcola la R |

Il ricalcolo è una nuova `AssessmentEvaluation` con fonte `FIT_RANKING_UPDATE`,
sulle stesse evidenze (primo set, round, micro-test, feedback del coach) e con la
classifica nuova:

- **calibrazione aperta**: valgono le regole di sempre, compresa la chiusura
  quando la regola di consolidamento è soddisfatta;
- **calibrazione chiusa**: la nuova R è consolidata solo se soddisfa ancora la
  regola, e allora P3/P6/P12 si rigenerano su di essa; altrimenti resta
  provvisoria e la R consolidata precedente rimane quella mostrata. Il programma
  già creato non cambia.

Cambiare solo il numero di tessera non ricalcola nulla. Se l'AI non risponde la
classifica resta salvata con `recalculatedAt` nullo, la pagina lo dice e un
nuovo salvataggio riprova il ricalcolo.

## Verifica

- Unit: `apps/api/src/discovery/fit-ranking/fit-ranking.spec.ts`.
- PostgreSQL: `apps/api/test/db/discovery.integration-spec.ts` (sequenza,
  storico, profilo, input AI senza tessera, correzione con ricalcolo).
- Web: `apps/web/app/components/fit-ranking-editor.test.tsx`.
