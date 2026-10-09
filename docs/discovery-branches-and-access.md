# Registrazione Google, accesso assistito e domande iniziali

## Accesso

- `/login`: accesso con email/password o Google; **Fai il quiz** avvia la registrazione su `/start`.
- `/accesso-assistito`: URL precedente, ora reindirizza a `/login`. I profili precompilati sono stati rimossi.
- `/start`: il pulsante **Registrati con Google** permette di identificarsi prima delle domande. Rimane disponibile anche alla fine della discovery.

Google usa l'OIDC già configurato, con state, nonce, PKCE e verifica server del token. Un nuovo utente Google completa prima una discovery valida e poi accetta i documenti correnti. Se Google viene avviato prima delle domande, il ritorno accompagna l'utente su `/start?google=complete`; al termine prosegue ai consensi senza chiedere password o ripetere Google. Una discovery incompleta o non più aggiornata viene ripresa prima dei consensi. Gli account Google già registrati passano dal router dell'applicazione, che sceglie l'area del ruolo. Un indirizzo già associato a credenziali locali continua a richiedere il suo accesso esistente: non viene collegato implicitamente a Google.

Le variabili OIDC rimangono quelle descritte in `apps/api/docs/google-oidc.md`.

## Configurare un percorso

Il profilo **Amministratore** trova **Discovery** nel menu, all'indirizzo `/admin/discovery` (si veda [Gestione admin della discovery](discovery-admin.md)). La pagina `/ai-tuner/discovery` non esiste più.

1. Crea o modifica una domanda con le sue opzioni; riordina trascinando o scegliendo la posizione.
2. Nella sezione **Quando mostrare la domanda** scegli **Sempre**, **Se tutte le condizioni sono vere** oppure **Se almeno una condizione è vera**.
3. Per ogni condizione seleziona una domanda precedente, il confronto e le risposte che aprono il ramo.
4. Salva: la nuova configurazione è immediatamente disponibile per nuove discovery. Le discovery già registrate conservano la configurazione accettata.

Una domanda condizionale può essere a sua volta genitore di altre domande. Per esempio: evento → torneo → data; oppure evento → vacanza → disponibilità. I percorsi possono ricongiungersi alle domande sempre visibili successive. Le domande sport e obiettivo restano sempre visibili quando previste dal contesto.

La migrazione configura **Quando sarà?** solo per **Un torneo**, **Un campionato** e **Una vacanza**. **Nessuno in particolare** salta la data, che rimane facoltativa nei rami in cui compare.

Avanzamento automatico, pulsante Indietro, conteggio dei passaggi, riepilogo e ripristino della bozza seguono il percorso visibile. Cambiare una risposta elimina le risposte dei rami esclusi; il server applica la stessa regola prima della persistenza e della costruzione del contesto di assessment. Una domanda obbligatoria lo è solo quando visibile.

## Contratto delle condizioni

Le condizioni sono conservate in `OnboardingQuestionTemplate.optionsJson.visibleWhen`, quindi non servono nuove tabelle. L'API amministrativa esistente valida struttura e riferimenti prima del salvataggio; disabilitare, eliminare o spostare un genitore ancora usato viene rifiutato. Occorre prima aggiornare i rami dipendenti.

```json
{
  "type": "date",
  "contextKey": "general_event_date",
  "visibleWhen": {
    "match": "all",
    "rules": [
      { "question": "pf4_event", "operator": "in", "values": ["0", "1", "2"] }
    ]
  }
}
```

`question` identifica la chiave stabile del template, non il testo. `values` usa gli ID delle opzioni per scelta singola/multipla, booleani per sì/no, numeri per numero/scala e stringhe ISO per date. `in` corrisponde ad almeno uno dei valori selezionati, `not_in` a nessuno. Una risposta assente, non valida o appartenente a una domanda nascosta non soddisfa mai una condizione, nemmeno negativa. Sono ammessi solo riferimenti a domande attive con posizione strettamente precedente: questo impedisce cicli e riferimenti irrisolvibili. I selettori sport/specializzazione non possono essere genitori perché il contesto fisso può ometterli.

Il motore di visibilità è mantenuto coerente in API e frontend con test equivalenti; la validazione del server resta autorevole. Gli altri questionari (assessment specialistico e check-in) conservano i propri flussi.

## Accesso e ripresa del percorso

La pagina `/login` offre email/password, il pulsante **Accedi con Google** e **Fai il quiz** verso `/start`. Dopo il login la home risolve il ruolo e, per gli atleti, lo stato di `/auth/journey`. Non esiste più il fallback al wizard legacy: `/onboarding` reindirizza a `/journey`. Se il journey manca o il servizio non risponde, viene mostrato un errore con possibilità di riprovare. I servizi backend onboarding rimangono usati per la validazione finale e la baseline.

Prima dell'account il quiz si riprende dalla bozza salvata sul server per 7 giorni dall'ultima risposta, sulla versione delle domande con cui è iniziato; la registrazione Google la collega allo stesso modo dell'email. Dettagli in `docs/discovery-pf5.md`, sezione Persistenza.
