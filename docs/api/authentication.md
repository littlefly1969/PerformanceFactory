# Autenticazione e autorizzazione API

## Meccanismi supportati

Le operazioni protette accettano due credenziali alternative:

- cookie di sessione HTTP-only, predefinito `pf.sid`;
- header `Authorization: Bearer <token>`.

Il cookie viene creato da `POST /api/auth/login` oppure dal flusso Google OIDC.
Le sessioni usano Redis quando `REDIS_URL` e configurato. In produzione Redis e
obbligatorio; il fallback in memoria e limitato allo sviluppo.

Il token bearer viene emesso da `GET /api/auth/token` soltanto in presenza di
una sessione valida. Ha durata di 1.800 secondi, e firmato HMAC e non e un token
OAuth/OIDC del provider Google. Il logout distrugge la sessione ma non mantiene
una deny-list dei bearer gia emessi: un token esistente resta valido fino alla
scadenza.

## Flusso locale

```text
POST /api/auth/login
        |
        +-- Set-Cookie: pf.sid=...; HttpOnly
        +-- profilo utente + accessToken breve
        |
GET/POST endpoint protetto
        |
        +-- cookie pf.sid oppure Authorization: Bearer ...
```

Il payload di login usa `email` e `password`. Non inviare credenziali tramite
query string e non memorizzare il cookie applicativo in JavaScript.

## Autorizzazione

`AuthenticatedGuard` risolve l'utente dalla sessione o dal bearer.
`RolesGuard` verifica i ruoli dichiarati con `@Roles`. I servizi applicano gli
ulteriori vincoli sul possesso o sulle relazioni tra entita.

Nel comportamento corrente, `AuthenticatedGuard` segnala con `403` anche una
sessione o un bearer assente/non valido; `401` e usato dal login per credenziali
errate. I client devono quindi distinguere il caso usando anche il contesto
dell'operazione, non il solo status.

Per la maggior parte delle operazioni, un utente con consensi obbligatori
mancanti riceve `403` con codice `REQUIRED_CONSENTS_MISSING`. Restano accessibili
gli endpoint necessari a leggere e aggiornare i consensi, oltre a logout,
profilo, token e health check.

## Cookie e CORS

Le richieste cross-origin devono usare credenziali (`credentials: include`).
Il server abilita CORS solo per gli origin presenti in `WEB_ORIGIN`. In
produzione il cookie e `secure` per impostazione predefinita; `sameSite` e
configurabile. Con `SameSite=None` e obbligatorio usare HTTPS.

## Google OIDC

Google e usato esclusivamente come identity provider. Il callback applicativo
crea o ripristina la sessione PerformanceFactory e poi reindirizza al frontend.
Per dettagli su state, pending registration e configurazione vedere
[Google OIDC](../../apps/api/docs/google-oidc.md).
