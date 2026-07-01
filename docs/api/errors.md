# Errori, validazione e limiti

## Formato base

Gli errori HTTP NestJS usano normalmente questa struttura:

```json
{
  "statusCode": 400,
  "message": "Richiesta non valida",
  "error": "Bad Request"
}
```

Per gli errori di validazione, `message` puo essere un array di stringhe. Alcuni
errori di dominio aggiungono campi stabili, per esempio:

```json
{
  "statusCode": 403,
  "code": "REQUIRED_CONSENTS_MISSING",
  "message": "Devi accettare i consensi obbligatori",
  "missingConsents": ["PRIVACY", "AI_ASSISTANT"]
}
```

I client devono usare innanzitutto status HTTP e `code`, quando presente. Il
testo di `message` e destinato alla diagnostica e puo cambiare.

## Status comuni

| Status | Significato                                               |
| ------ | --------------------------------------------------------- |
| `400`  | Payload, parametro o transizione non valida               |
| `401`  | Credenziali di login non valide                           |
| `403`  | Autenticazione assente/non valida o accesso insufficiente |
| `404`  | Risorsa non trovata o non visibile all'attore             |
| `409`  | Conflitto con una risorsa o uno stato esistente           |
| `429`  | Rate limit superato                                       |
| `500`  | Errore inatteso del server                                |

La specifica OpenAPI collega questi errori a componenti riutilizzabili. Gli
status effettivamente possibili dipendono dalla singola operazione e dalle
regole di dominio eseguite dai servizi.

## Validazione request

La `ValidationPipe` globale:

- rimuove ogni campo non dichiarato nei DTO (`whitelist`);
- rifiuta la request se sono presenti campi estranei
  (`forbidNonWhitelisted`);
- applica le trasformazioni esplicite dei DTO;
- restituisce tutte le violazioni rilevate, non solo la prima.

La conversione implicita dei tipi e disabilitata. Un numero inviato come query
string deve quindi essere convertito esplicitamente dal controller o da una
pipe dedicata.

## Rate limiting

La registrazione atleta e limitata a 3 richieste ogni 15 minuti. Il login usa un
guard di rate limit dedicato. Con `REDIS_URL` il limite e condiviso tra istanze;
in sviluppo puo usare memoria locale. I client devono trattare `429` con
backoff e non ripetere immediatamente la stessa richiesta.
