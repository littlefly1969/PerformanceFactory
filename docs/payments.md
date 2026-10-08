# Pagamenti e abbonamento

Backend dei pagamenti allineato al Product Blueprint (A4 Offerta gratuita/pagamento v1.1, A5 Piano di abbonamento v1.0, CURRENT Index 02/10/2026).

## Modello

- **Un solo livello funzionale** di abbonamento; l'entitlement è unico.
- **`ProgramHorizon`** (`PROGRAM_3M`, `PROGRAM_6M`, `PROGRAM_12M`, collegati a P3/P6/P12) e **`BillingCycle`** (`MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL`) sono campi distinti nel database, nel checkout e negli eventi.
- **Prezzi** (`BillingCyclePrice`) e **matrice orizzonte × cadenza** (`ProgramBillingOption`) sono dati gestiti da back office, mai valori nel codice. La migrazione semina le ipotesi A5: €19,90 / €50 / €90 / €150 e la matrice 3M = mensile/trimestrale, 6M = fino a semestrale, 12M = tutte le cadenze.
- **`Subscription`** registra provider, canale di acquisto (`WEB`, `IOS`, `ANDROID`), importo e valuta al momento dell'acquisto, `entitlementEndAt`, `nextChargeAt`, `cancelAtPeriodEnd`, `graceEndsAt` e le date dell'orizzonte (`programStartedAt`, `programEndsAt`). L'orizzonte parte alla prima attivazione e non si sposta con i rinnovi.
- **`PaymentEvent`** è il registro idempotente e auditabile di ogni webhook ricevuto, con l'esito sul modello PF (`ACTIVATED`, `RENEWED`, `PAYMENT_GRACE_STARTED`, `PAYMENT_RECOVERED`, `PAUSED`, `RESUMED`, `EXPIRED`, `CHECKOUT_EXPIRED`).

### Stati

| Stato | Accesso | Origine |
|---|---|---|
| `CHECKOUT_PENDING` | no | checkout creato, pagamento non ancora confermato |
| `ACTIVE` | sì, fino a `entitlementEndAt` | pagamento riuscito; con `cancelAtPeriodEnd` resta attivo fino a scadenza |
| `PAYMENT_GRACE` | sì, fino a `graceEndsAt` | rinnovo fallito, 6 giorni di tolleranza (`PAYMENTS_GRACE_DAYS`) |
| `PAUSED` | no | sospensione dal provider; la regola esatta è ancora aperta (A5-D03) |
| `EXPIRED` | no | abbonamento terminato: stato read-only secondo A4 |
| `CHECKOUT_EXPIRED` | no | checkout abbandonato, scaduto o sostituito da una scelta diversa |
| `CHECKOUT_FAILED` | no | il provider non ha creato il checkout, o la preparazione si è interrotta |

`SubscriptionsService.hasActiveEntitlement(userId)` è il punto unico da usare per il paywall di piano, coaching e calendario. In questa slice non è ancora applicato alle rotte esistenti.

## Provider

Ogni provider implementa `PaymentProviderAdapter` (`apps/api/src/payments/providers/payment-provider.ts`) e traduce i propri webhook in eventi normalizzati. Aggiungere PayPal diretto, App Store o Google Play significa scrivere un nuovo adapter e registrarlo in `PaymentProviderRegistry`; servizi, stati e database non cambiano.

- **`stub`** (default fuori produzione): nessuna rete e nessun addebito. È rifiutato con `NODE_ENV=production`.
- **`stripe`**: Stripe Billing con Checkout ospitato (i dati di carta non passano dai server PF). Il prezzo è inviato come `price_data` dai dati di back office, quindi non serve creare prodotti o prezzi nella dashboard. PayPal si attiva come metodo di pagamento dalla dashboard Stripe, senza modifiche al codice.

## API

| Metodo | Percorso | Ruolo |
|---|---|---|
| `GET` | `/api/payments/offers` | pubblico: orizzonti con le cadenze attive e i prezzi |
| `POST` | `/api/payments/checkout` `{ horizon, billingCycle }` | `USER`: crea il checkout e restituisce `checkoutUrl` |
| `GET` | `/api/payments/subscription` | `USER`: `{ entitled, subscription }` |
| `POST` | `/api/payments/subscription/cancel` | `USER`: disdetta a fine periodo, accettata fino a 24 ore prima della scadenza (`PAYMENTS_CANCEL_NOTICE_HOURS`) |
| `POST` | `/api/payments/subscription/resume` | `USER`: revoca la disdetta |
| `POST` | `/api/payments/webhooks/:provider` | provider (`stripe`, `stub`), firma obbligatoria |
| `GET` | `/api/admin/payments/catalog` | `ADMIN`: prezzi e matrice |
| `PUT` | `/api/admin/payments/prices/:billingCycle` `{ amountCents, currency? }` | `ADMIN` |
| `PUT` | `/api/admin/payments/options/:horizon/:billingCycle` `{ isActive }` | `ADMIN` |

Il checkout è rifiutato se la combinazione non è attiva o se l'utente ha già un abbonamento attivo, in grace o in pausa.

## Concorrenza e ordine degli eventi

- **Un solo abbonamento non terminale per utente** (`CHECKOUT_PENDING`, `ACTIVE`, `PAYMENT_GRACE`, `PAUSED`): lo garantisce l'indice parziale `Subscription_one_open_per_user_key` nella migrazione, indipendente dall'entitlement.
- **Creazione del checkout serializzata per utente** con un advisory lock PostgreSQL. Un doppio click riceve lo stesso checkout; una scelta diversa chiude prima il checkout precedente presso il provider (se risulta già pagato la richiesta è rifiutata) e poi ne apre uno nuovo. Il checkout scade dopo `PAYMENTS_CHECKOUT_TTL_MINUTES` (30 di default, minimo Stripe).
- **Nessun record orfano**: se il provider fallisce l'abbonamento passa a `CHECKOUT_FAILED` e l'utente può riprovare; una preparazione interrotta da un crash viene chiusa dopo 60 secondi.
- **Webhook**: l'evento viene registrato e applicato nella stessa transazione, con lock della riga `Subscription`, quindi eventi diversi sullo stesso abbonamento non si sovrappongono. Ogni evento conserva la data del provider (`providerCreatedAt`); un evento più vecchio dell'ultimo applicato (`lastProviderEventAt`) è registrato con esito `STALE` e non cambia lo stato. Un periodo più vecchio non accorcia mai l'accesso. La grace parte dalla data dell'evento di pagamento fallito, non da quella di consegna.
- I test su PostgreSQL reale (`test/db/payments*.integration-spec.ts`) coprono doppio click, cambio di scelta, provider in errore, indice di unicità, riconsegne concorrenti, eventi diversi simultanei e consegna fuori ordine. L'API legge il corpo grezzo delle richieste (`rawBody: true` in `main.ts`) per verificare le firme dei webhook.

## Configurazione

| Variabile | Default | Note |
|---|---|---|
| `PAYMENTS_PROVIDER` | `stub` fuori produzione | `stub` o `stripe`; obbligatoria in produzione |
| `PAYMENTS_GRACE_DAYS` | `6` | A5.8 |
| `PAYMENTS_CANCEL_NOTICE_HOURS` | `24` | A5.5: disdetta entro il giorno precedente la scadenza |
| `PAYMENTS_CHECKOUT_TTL_MINUTES` | `30` | durata del checkout ospitato, tra 30 e 1440 |
| `PAYMENTS_SUCCESS_URL` / `PAYMENTS_CANCEL_URL` | `WEB_ORIGIN/abbonamento?checkout=…` | ritorno dal checkout |
| `PAYMENTS_STUB_WEBHOOK_SECRET` | vuoto | se presente, i webhook stub richiedono l'header `x-pf-stub-signature` (HMAC-SHA256 del corpo) |
| `STRIPE_SECRET_KEY` | vuoto | solo `sk_test_…`; una chiave live è rifiutata salvo `STRIPE_ALLOW_LIVE_KEYS=true` |
| `STRIPE_WEBHOOK_SECRET` | vuoto | `whsec_…` della dashboard o della Stripe CLI |

L'API parte anche senza chiavi: il provider viene creato al primo checkout o webhook.

## Collaudo in modalità test

### Con lo stub

```bash
# 1. checkout (sessione utente USER)
curl -b cookie.txt -X POST localhost:4000/api/payments/checkout \
  -H 'content-type: application/json' \
  -d '{"horizon":"PROGRAM_12M","billingCycle":"MONTHLY"}'
# 2. simula il pagamento con il checkoutId restituito nell'URL (stub_checkout=...)
curl -X POST localhost:4000/api/payments/webhooks/stub -H 'content-type: application/json' \
  -d '{"id":"evt-1","type":"CHECKOUT_COMPLETED","data":{"checkoutId":"stub_cs_...","subscriptionRef":"stub_sub_1"}}'
# 3. altri eventi: PAYMENT_FAILED, PAYMENT_SUCCEEDED, SUBSCRIPTION_UPDATED {state: ACTIVE|PAST_DUE|PAUSED|ENDED}
```

### Con Stripe (sandbox gratuita)

1. Crea un account Stripe e resta in modalità test; copia la chiave segreta `sk_test_…`.
2. `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`.
3. Inoltra i webhook in locale con la Stripe CLI e copia il `whsec_…` stampato in `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:4000/api/payments/webhooks/stripe \
     --events checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed
   ```
4. Paga con la carta di test `4242 4242 4242 4242`; `4000 0000 0000 0341` simula un rinnovo fallito.
5. In dashboard (Billing → Revenue recovery) allinea i tentativi automatici ai 6 giorni di grace e scegli di cancellare l'abbonamento quando i tentativi falliscono: l'evento `customer.subscription.deleted` porta lo stato a `EXPIRED`.

## Decisioni aperte (non cablate)

- Prezzi definitivi (A5-D01) e cadenze commercialmente attive sul 12M (A5-D02): back office.
- Regola di sospensione (A5-D03): lo stato `PAUSED` esiste, la regola sull'orizzonte no.
- Cambio di cadenza o di orizzonte e prorata (A5-D04): non implementati.
- Rimborsi monetari vs credito in Token PF (A5-D07): non implementati; il wallet Token PF resta separato dal billing.
- Acquisti in-app iOS/Android: il modello registra `purchaseChannel`, gli adapter degli store non esistono ancora.
- Il checkout non verifica ancora lo stato `PAYWALL_READY` né che l'orizzonte pagato sia quello scelto (`AthleteDiscovery.programHorizon`, vedi `scenari-orizzonte.md`).
