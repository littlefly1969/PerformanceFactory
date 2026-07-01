# API HTTP e specifica OpenAPI

## Contratto e versionamento

Tutte le route applicative hanno prefisso `/api`. La versione indicata nel
documento OpenAPI e configurata da `API_VERSION`; al momento le URL non hanno
un segmento di versione. Una modifica incompatibile richiede quindi una nuova
strategia di versionamento prima del rilascio, non il solo incremento del campo
informativo OpenAPI.

La specifica viene costruita dal codice NestJS durante il bootstrap. I DTO con
decoratori `class-validator` definiscono la validazione runtime; i decoratori
`@nestjs/swagger` definiscono descrizioni, esempi e forme OpenAPI. Le due parti
devono essere aggiornate insieme.

Percorsi predefiniti in sviluppo:

| Risorsa      | URL                                |
| ------------ | ---------------------------------- |
| Swagger UI   | `http://127.0.0.1:4000/docs`       |
| OpenAPI JSON | `http://127.0.0.1:4000/docs-json`  |
| OpenAPI YAML | `http://127.0.0.1:4000/docs-yaml`  |
| Health check | `http://127.0.0.1:4000/api/health` |

Il percorso base della UI e configurabile tramite `SWAGGER_PATH`. I suffissi
`-json` e `-yaml` seguono automaticamente il percorso scelto.

## Aree funzionali

| Tag OpenAPI              | Responsabilita                                     | Accesso principale         |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| `system`                 | Identificazione e health check                     | Pubblico                   |
| `auth`                   | Login locale, Google OIDC, logout, profilo e token | Misto                      |
| `consents`               | Documenti e accettazione consensi                  | Misto                      |
| `onboarding`             | Profilazione, sport, obiettivo e risposte iniziali | Atleta                     |
| `areas`                  | Catalogo aree                                      | Autenticato                |
| `relationships`          | Collegamenti atleta-professionista                 | Ruolo dipendente           |
| `guidance`               | Contenuti professionali e assegnazioni             | Professionista/admin       |
| `assignments`            | API legacy V1                                      | Atleta, deprecata          |
| `questions` / `answers`  | Questionari, revisione e risposte                  | Atleta/professionista      |
| `plans` / `user`         | Piani, allenamenti e completamento                 | Ruolo dipendente           |
| `performance`            | Profilo prestazionale e storico                    | Ruolo/relazione dipendente |
| `professional-approvals` | Coda approvazioni                                  | Professionista             |
| `cycles`                 | Stato cicli                                        | Professionista/admin       |
| `admin-cycles`           | Gestione utenti, consensi e orchestrazione         | Admin                      |
| `inspect`                | Ispezione e configurazione operativa               | Admin                      |
| `ai-tuning`              | Prompt, audit, replay, golden ed evaluation        | AI tuner/admin             |

I ruoli applicativi sono `USER`, `PROFESSIONAL`, `ADMIN` e `AI_TUNER`. Il ruolo
non e l'unico vincolo: alcuni servizi applicano anche controlli ABAC sulla
relazione professionista-atleta, sull'area di competenza e sul proprietario
della risorsa.

## Uso della UI

Per una sessione browser:

1. eseguire `POST /api/auth/login` dalla UI con le credenziali;
2. il browser conserva il cookie HTTP-only `pf.sid`;
3. le richieste successive includono il cookie perché Swagger usa
   `withCredentials`;
4. in alternativa chiamare `GET /api/auth/token`, copiare `accessToken` e usare
   **Authorize** con lo schema bearer.

La UI conserva l'autorizzazione tra i refresh del browser. Non usare account o
token di produzione su workstation condivise.

## Esportazione della specifica

Con API locale avviata:

```bash
curl -fsS http://127.0.0.1:4000/docs-json -o openapi.json
curl -fsS http://127.0.0.1:4000/docs-yaml -o openapi.yaml
```

La specifica esportata puo alimentare generatori client, contract test e
validatori OpenAPI. Prima di pubblicarla verificare che non contenga URL,
esempi o descrizioni riservate.

## Regole di manutenzione

Per ogni nuovo endpoint:

1. usare un DTO nominato per body complessi e applicare `class-validator`;
2. aggiungere `@ApiOperation` con summary orientato all'azione;
3. documentare parametri path/query, formati, enum e limiti;
4. dichiarare `@ApiCookieAuth()` sugli endpoint protetti;
5. dichiarare tipi ed esempi delle risposte quando non inferibili;
6. aggiungere o aggiornare test e2e per il comportamento;
7. aggiornare i documenti di flusso se cambia un processo applicativo.

Gli errori trasversali vengono aggiunti dalla configurazione centralizzata; un
errore di dominio specifico deve essere descritto anche sull'operazione che lo
produce.
