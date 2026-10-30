# Autenticazione e autorizzazione API

## Meccanismi supportati

Le operazioni protette accettano due credenziali alternative:

- cookie di sessione HTTP-only, predefinito `pf.sid`;
- header `Authorization: Bearer <token>`.

Il cookie viene creato da `POST /api/auth/login`, dal flusso Google OIDC oppure
da una passkey (`POST /api/auth/passkeys/login/verify`).
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

## Passkey (Face ID, impronta)

Le passkey WebAuthn sono un accesso in più: password e Google restano validi.
Il server conserva solo la chiave pubblica (tabella `Passkey`); il dato
biometrico e la chiave privata restano sul dispositivo, sincronizzati da
iCloud o Google Password Manager.

| Endpoint | Accesso | Uso |
| --- | --- | --- |
| `GET /api/auth/passkeys` | autenticato | Elenco delle passkey dell'utente |
| `POST /api/auth/passkeys/register/options` | autenticato | Challenge per crearne una |
| `POST /api/auth/passkeys/register/verify` | autenticato | Verifica e salva la passkey |
| `DELETE /api/auth/passkeys/:id` | autenticato | Elimina una passkey propria |
| `POST /api/auth/passkeys/login/options` | pubblico, 20/min | Challenge per l'accesso |
| `POST /api/auth/passkeys/login/verify` | pubblico, 20/min | Verifica, rigenera la sessione e risponde come il login |

- Il dominio (`rpID`) e gli origin ammessi derivano da `WEB_ORIGIN`: le passkey
  valgono solo su quel dominio. In sviluppo serve `localhost`: WebAuthn non
  accetta indirizzi IP come `127.0.0.1`. Per un
  dominio padre diverso si può impostare `WEBAUTHN_RP_ID`.
- Il challenge vive nella sessione per 5 minuti e si consuma al primo uso.
- Si richiede sempre la verifica dell'utente (Face ID, impronta o PIN).
- L'accesso con passkey applica gli stessi blocchi del login per account non
  attivi o candidature rifiutate.
- Nella web app installata su iOS la richiesta parte solo da un tocco: il
  login mostra il pulsante «Accedi con Face ID o impronta» e, dove il browser
  lo supporta, propone la passkey già dal campo e-mail.
