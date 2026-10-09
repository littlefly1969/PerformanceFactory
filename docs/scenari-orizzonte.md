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

## P formulata dall'AI entro criteri versionati (PF-FS-PREPAYWALL §7.1, §7.3)

A R consolidata il Performance Engine AI
(`apps/api/src/ai-orchestrator/potential-generation.ts`) scrive P3, P6 e P12 per
ogni driver, con confidenza e motivazione. Il prompt è la famiglia `POTENTIAL`,
modificabile e versionata dall'AI Tuner in `/ai-tuner/prompts/potenziale`.

Il backend accetta solo una proposta entro i criteri `potential-criteria` v1
(`POTENTIAL_CRITERIA`), inviati all'AI come limiti per driver e orizzonte:

| Criterio | Valore v1 (da approvare, Parte C) |
|---|---|
| Tetto per livello (quota della scala) | principiante 70%, intermedio 80%, avanzato 88%, agonista 94%, professionista 98%; livello assente 80% |
| Quota massima del margine R→tetto | 3 mesi 50%, 6 mesi 75%, 12 mesi 95% |
| Confidenza massima, rispetto a min(driver, livello) | 3 mesi 90%, 6 mesi 75%, 12 mesi 60% |
| Forma | P fra R e il limite, mai in calo da P3 a P12; confidenza mai in crescita; motivazione di massimo 300 caratteri |

Un driver già oltre il tetto resta dov'è. Una proposta fuori criteri non arriva
all'atleta. Finché i criteri non sono approvati gli scenari restano marcati come
stima provvisoria (`provisional = true`). Cambiare un valore richiede una nuova
versione dei criteri.

Gli scenari si scrivono una volta per valutazione consolidata, sotto il lease
della calibrazione (chiusa, quindi libero): richieste concorrenti non chiamano
il provider due volte, e il salvataggio ricontrolla sotto lock. Mentre l'AI
scrive, `scenarios` vale `{ status: "PENDING" }`; se il provider fallisce o la
proposta è fuori criteri vale `{ status: "UNAVAILABLE" }` e la prossima apertura
riprova (OP-09). Gli scenari già mostrati non cambiano con un nuovo prompt o una
nuova versione dei criteri: vale il primo insieme scritto per la valutazione,
anche se di un motore precedente (`provisional-plateau`).

## Persistenza

| Tabella | Contenuto |
|---|---|
| `PotentialScenario` | per valutazione, motore, versione, orizzonte e driver: R di partenza, P, confidence, `assumptions` (motivazione AI, criteri, versione del prompt, provider, modello, hash), `provisional`, `computedAt` |
| `AthleteDiscovery` | `programHorizon`, `horizonSelectedAt`, `activatedAt`, `paywallViewedAt` |
| `AthleteCalibration` | nuovo stato `PAYWALL_READY` |

## API

| Metodo e percorso | Effetto |
|---|---|
| `GET /auth/journey` | aggiunge `scenarios` (motore, scala, orizzonti con driver e gap, orizzonte scelto) a calibrazione chiusa e con il flag attivo |
| `POST /athlete-journey/horizon` | `{ horizon: PROGRAM_3M | PROGRAM_6M | PROGRAM_12M }`: solo dopo il reveal (`activatedAt`), salva la scelta, porta a `PAYWALL_READY`, scrive l'evento `program_horizon_selected`; si può cambiare finché non c'è un abbonamento pagato (409 dopo) |
| `POST /athlete-journey/paywall/viewed` | prima apertura del paywall, solo a `PAYWALL_READY`: `paywallViewedAt` ed evento `paywall_viewed` una volta |
| `GET /payments/offers` | (da #9) cadenze attive per orizzonte; il web mostra solo quelle dell'orizzonte scelto |
| `POST /payments/checkout` | 409 se il percorso non è `PAYWALL_READY` o se l'orizzonte dell'offerta non è quello scelto (#14) |

## Reveal, gap e attivazione (PF-FS-PREPAYWALL §7.3)

Ogni orizzonte riporta due gap nella scala della valutazione:

- **complessivo**: media delle R dei driver e media dei P, con la differenza;
- **tecnico-tattico**: R, P e differenza del driver `Tecnico-tattica` (alias
  `Technical-Tactical`); `null` se il driver non c'è, mai stimato.

La prima risposta che contiene R consolidata, P e gap rende l'atleta
`ACTIVATED` (`AthleteDiscovery.activatedAt`, A10) e scrive `gap_displayed` una
volta per valutazione. Registrazione, lezione o prenotazione non attivano.

Eventi del reveal: `r_consolidated` alla chiusura per regola
(`completeCalibration`), `potential_generated` alla prima scrittura degli
scenari per valutazione e motore, `gap_displayed`, `program_horizon_selected`,
`paywall_viewed`.

Il paywall arriva quindi solo dopo il reveal: l'orizzonte si sceglie solo con
`activatedAt`, il checkout accetta solo `PAYWALL_READY` e l'orizzonte scelto, e
R si consolida dopo la lezione quando la lezione è possibile (slice 2). Scelta
e checkout prendono lo stesso lock per atleta.

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

`potential-generation.spec.ts` (limiti dei criteri, proposte rifiutate),
`reveal-gap.spec.ts`, `test/db/scenarios.integration-spec.ts` (flag, una sola
chiamata AI anche concorrente, errore del provider e nuovo tentativo, stabilità
degli scenari mostrati, attivazione ed eventi, scelta e blocco dell'orizzonte,
`PAYWALL_READY`, programma bloccato fino all'abbonamento),
`test/db/payments*.integration-spec.ts` (checkout solo dopo il reveal),
`app/journey/scenarios-reveal.test.tsx`, `app/ai-tuner/prompts/potenziale`.

## Aperto

- **Criteri definitivi** (Parte C, OP-03): i valori v1 vanno approvati; sono
  costanti versionate nel codice, non back office.
- **Freshness**: oggi gli scenari si scrivono solo con una nuova valutazione
  consolidata. Dopo la calibrazione serviranno dati di
  allenamento per aggiornarli.
- **Atleti del percorso precedente** (baseline senza calibrazione): non
  arrivano a `PAYWALL_READY`, quindi il checkout li respinge.
