# Consensi privacy e assistente AI

I consensi obbligatori sono gestiti come documenti versionati nel database.
La tabella principale e' `ConsentDocument`; le accettazioni utente sono in
`Consent`.

## Documenti correnti

Endpoint pubblico per registrazione:

```text
GET /api/consents/documents
```

Endpoint autenticato per stato utente:

```text
GET /api/consents/required
POST /api/consents/required
```

Il client deve inviare, oltre alle checkbox esplicite, anche i documenti
accettati:

```json
{
  "privacyAccepted": true,
  "aiAssistantAccepted": true,
  "acceptedDocuments": [
    {
      "type": "PRIVACY",
      "version": "privacy-v1-2026-05-04",
      "documentHash": "..."
    },
    {
      "type": "AI_ASSISTANT",
      "version": "ai-assistant-v1-2026-05-04",
      "documentHash": "..."
    }
  ]
}
```

Il backend rifiuta l'accettazione se `version` o `documentHash` non
corrispondono ai documenti attivi.

## Gestione admin

Pagina:

```text
/admin/consents
```

Endpoint:

```text
GET /api/admin/consent-documents
POST /api/admin/consent-documents
```

Pubblicare una nuova versione disattiva le altre versioni attive dello stesso
tipo. Da quel momento gli utenti che non hanno accettato la nuova combinazione
`type/version/hash` vengono bloccati su `/consents`.

## Blocco applicativo

`AuthenticatedGuard` controlla i consensi richiesti per le API operative.
Sono escluse solo le API necessarie ad autenticazione, logout, health check e
accettazione consensi:

```text
/api/auth/me
/api/auth/token
/api/auth/logout
/api/consents/required
/api/consents/documents
/api/health
```

## Audit

Ogni riga `Consent` salva:

- utente;
- tipo;
- versione;
- titolo documento;
- hash;
- snapshot del testo accettato;
- IP;
- user agent;
- sorgente (`password_register`, `google_register`, `reconsent`).

## Migrazione

La migrazione che abilita i documenti versionati e':

```text
20260505154000_consent_documents
```

Va applicata in produzione con:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.example.yml run --rm api \
  ./node_modules/.bin/prisma migrate deploy
```
