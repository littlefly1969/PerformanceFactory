# Scenari P3/P6/P12 e scelta del percorso

## Risultato

Quando la calibrazione si chiude (`CALIBRATION_COMPLETED`, vedi
`calibrazione.md`), l'atleta vede tre Spider, R+P3, R+P6 e R+P12, e sceglie un
percorso di 3, 6 o 12 mesi. La scelta porta il percorso a `PAYWALL_READY` e
mostra le cadenze di pagamento attive per quell'orizzonte (offerta di #9). Il
pagamento è il passo successivo (gap 1.10-1.11).

```
CALIBRATION_COMPLETED ──reveal P3/P6/P12──► scelta 3/6/12 mesi ──► PAYWALL_READY
                                                                      │
                                       abbonamento con entitlement ◄──┘ sblocca il programma
```

Tutto è dietro il feature flag `potential_scenarios`, spento di default: si
rilascia prima ai beta tester da `/admin/feature-flags`. Con il flag spento il
percorso resta a `CALIBRATION_COMPLETED`, come nella slice 2.

Riferimenti del Product Blueprint: A3.9 (P3/P6/P12 solo a calibrazione chiusa,
senza inventare P), A4.4 (Spider), A5 (orizzonte e cadenza indipendenti).

## Motore di P sostituibile

`apps/api/src/discovery/scenarios/potential-engine.ts` definisce un'interfaccia
unica (`PotentialEngine`). Il motore in uso è `ACTIVE_POTENTIAL_ENGINE`: il
motore della Parte C lo sostituirà senza toccare servizio, API e interfaccia.

**Motore provvisorio `provisional-plateau` v1, da approvare.** Non è lineare: ogni
mese colma una quota del margine tra R e un tetto che dipende dal livello, quindi
la crescita rallenta e si appiattisce.

```
P(h) = R + (tetto − R) · (1 − (1 − quota)^h)        h = 3, 6, 12 mesi
quota = 0,10 · commitment · disponibilità            (massimo 0,5)
confidence(h) = min(confidence del driver, confidence del livello) · fattore orizzonte
```

| Parametro | Valori |
|---|---|
| Tetto per livello (quota della scala) | principiante 70%, intermedio 80%, avanzato 88%, agonista 94%, professionista 98%; livello assente 80% |
| Fattore commitment del driver | basso 0,5, medio 1, alto 1,4, sconosciuto 0,8 |
| Fattore disponibilità (giorni a settimana dell'assessment) | 1 → 0,6, 2 → 0,85, 3 → 1, 4+ → 1,15, mancante → 0,85 |
| Fattore di confidence per orizzonte | 3 mesi 0,9, 6 mesi 0,75, 12 mesi 0,6 |

Un driver già al tetto resta dov'è (plateau). Ogni scenario salva le assunzioni
usate, il motore, la versione e `provisional = true`.

## Persistenza

| Tabella | Contenuto |
|---|---|
| `PotentialScenario` | per valutazione, motore, versione, orizzonte e driver: R di partenza, P, confidence, assunzioni, `provisional`, `computedAt` |
| `AthleteDiscovery` | `programHorizon` e `horizonSelectedAt` |
| `AthleteCalibration` | nuovo stato `PAYWALL_READY` |

Gli scenari si calcolano una volta per valutazione consolidata e motore (vincolo
unico, `createMany` con `skipDuplicates`): due richieste simultanee non duplicano
nulla. Una nuova valutazione consolidata o un nuovo motore producono nuove righe;
le precedenti restano come storico.

## API

| Metodo e percorso | Effetto |
|---|---|
| `GET /auth/journey` | aggiunge `scenarios` (motore, scala, orizzonti con driver, orizzonte scelto) a calibrazione chiusa e con il flag attivo |
| `POST /athlete-journey/horizon` | `{ horizon: PROGRAM_3M | PROGRAM_6M | PROGRAM_12M }`: salva la scelta, porta a `PAYWALL_READY`, scrive l'evento `program_horizon_selected`; si può cambiare finché non c'è l'abbonamento |
| `GET /payments/offers` | (da #9) cadenze attive per orizzonte; il web mostra solo quelle dell'orizzonte scelto |

## Programma bloccato fino all'abbonamento

`assertProgramAllowed` continua a rispondere 409 `PROGRAM_LOCKED_BEFORE_PAYWALL`
a chi ha una valutazione AI, anche a `PAYWALL_READY`. Ora lo sblocca un
abbonamento con entitlement attivo (`ACTIVE` entro `entitlementEndAt`, oppure
`PAYMENT_GRACE` entro `graceEndsAt`). `programBeforePaywall` resta l'eccezione da
back office.

## Durate del programma: da 4/12/52 settimane a 3/6/12 mesi

Il motore di training lavora a finestre di 14 giorni, quindi ogni orizzonte è un
numero pari di settimane: 3 mesi = 12, 6 mesi = 26, 12 mesi = 52.

- `TrainingConstraintsService`, il DTO della disponibilità, il passo `DURATION`
  del percorso e il profilo accettano 12, 26 o 52 settimane.
- Il prompt di training parla di programma di 3, 6 o 12 mesi.
- Migrazione dei dati esistenti: 4 e 12 settimane → 3 mesi (12 settimane), 52 →
  12 mesi. `programHorizon` viene valorizzato e `program_duration_weeks` nel
  profilo dell'onboarding segue la stessa mappatura.

Migrazione: `20261009090000_potential_scenarios`.

## Test

`potential-engine.spec.ts` (forma della curva, plateau, commitment e disponibilità,
confidence, altre scale), `test/db/scenarios.integration-spec.ts` (flag, calcolo
unico anche concorrente, scelta e cambio di orizzonte, `PAYWALL_READY`, programma
bloccato fino all'abbonamento), `app/journey/scenarios-reveal.test.tsx`.

## Aperto

- **Motore definitivo** (Parte C): il provvisorio va approvato da Stefano; i suoi
  parametri sono costanti nel codice, non back office.
- **Freshness**: oggi gli scenari si ricalcolano solo con una nuova valutazione
  consolidata o un nuovo motore. Dopo la calibrazione serviranno dati di
  allenamento per aggiornarli.
- **Checkout** (#9): non verifica ancora che l'orizzonte pagato sia quello scelto
  né lo stato `PAYWALL_READY`; arriva con il paywall (1.10).
