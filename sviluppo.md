# PerformanceFactory - Stato Dell'Arte

Aggiornato al 6 maggio 2026, verificando codice API, Web, Prisma, migrazioni, env example, compose e build.

## Architettura

PerformanceFactory e' un monorepo applicativo:

- `apps/api`: NestJS con Fastify, Passport session, cookie HTTP-only, bearer token breve, Prisma e PostgreSQL.
- `apps/web`: Next.js App Router con UI per atleta, coach e admin.
- `infra`: compose di sviluppo per PostgreSQL/Redis e compose production di esempio.
- `apps/api/prisma`: schema, migrazioni e seed.

Il dominio e' organizzato su tre ruoli:

- `USER`: atleta.
- `PROFESSIONAL`: coach/professionista abilitato per una o piu' aree.
- `ADMIN`: governa utenti, coach, prompt, anamnesi, generazione e pubblicazione cicli.

## Stato Funzionale

Il prodotto supporta oggi:

- Registrazione pubblica di nuovi atleti da pagina login.
- Creazione account atleta sospeso (`isActive=false`) in attesa di admin.
- Consensi privacy e assistente AI obbligatori, con documenti versionati in DB e hash server-side.
- Registrazione Google OIDC come identity provider: verifica Google, accettazione consensi, poi creazione account atleta sospeso.
- Abilitazione/disabilitazione atleta da admin.
- Collegamento coach-atleta per singola area.
- Competenze coach per area.
- Anamnesi iniziale dinamica da template DB, modificabile da admin.
- Baseline iniziale per area con snapshot performance e `CurrentState`.
- Prompt AI globali o specifici per area/livello, modificabili da admin.
- Contesto iniziale AI, forma risposta e layout JSON questionari configurabili una volta per area.
- Preview del prompt AI prima della generazione.
- Generazione ciclo AI per singola area.
- Approvazione umana da coach per piano e questionario.
- Pubblicazione admin.
- Esecuzione piano e questionario lato atleta; il submit del questionario chiude automaticamente il check-in.
- Chiusura ciclo e aggiornamento performance.

## Aree Performance

Il seed configura 6 aree:

- Technical-Tactical
- Athletic Preparation
- Equipment
- Physiotherapy
- Nutrition
- Mental Training

Ogni ciclo operativo e' area-scoped: piano, questionario, approvazione, coach owner e stato sono legati a una singola area.

## Utenti E Accesso

Autenticazione:

- Login locale con email/password.
- Sessione cookie via Passport.
- Token bearer breve ottenibile da sessione attiva.
- Rate limit sul login.

Nuovi atleti:

- Endpoint: `POST /api/auth/register-athlete`.
- Campi: `firstName`, `lastName`, `email`, `password`, `privacyAccepted`, `aiAssistantAccepted`, `acceptedDocuments`.
- Password minima: 8 caratteri.
- Account creato come `USER` e `isActive=false`.
- Login bloccato finche' l'admin non abilita.
- I consensi vengono salvati solo se versione e hash dei documenti accettati corrispondono ai documenti attivi.

Google OIDC:

- Endpoint: `GET /api/auth/google/login`, `GET /api/auth/google/register`, `GET /api/auth/google/callback`.
- La registrazione Google usa `/register/google/consents` prima di creare l'utente.
- Email gia' presenti con altro metodo non vengono collegate automaticamente.

Admin:

- Endpoint attivazione: `PATCH /api/admin/users/:userId/activate`.
- Endpoint disattivazione: `PATCH /api/admin/users/:userId/deactivate`.
- Dashboard operations mostra richieste pendenti e stato assegnazione coach.

## Onboarding E Anamnesi

L'onboarding non e' piu' hardcoded: legge da `OnboardingQuestionTemplate`.

Tipi domanda:

- `TEXT`
- `NUMBER`
- `SELECT`
- `SCORE`

Scope:

- `GENERAL`: profilo generale atleta, per esempio altezza, peso, eta', salute, sedentarieta', frequenza allenamento.
- `AREA`: anamnesi specifica per area; le domande `SCORE` alimentano baseline e livello.

Submit onboarding:

- Salva risposte complete in `UserOnboardingAssessment.answersJson`.
- Salva profilo generale in `UserOnboardingAssessment.profileJson`.
- Calcola media delle risposte `SCORE` per area.
- Crea `PerformanceProfileSnapshot` e `PerformanceProfileSnapshotArea`.
- Crea/aggiorna `CurrentState` con livello:
  - `BASELINE` sotto 60
  - `STABLE` da 60
  - `ADVANCED` da 80

Admin AI config permette di creare e modificare le domande senza cambiare codice.

## AI E Prompt

Provider supportati:

- `stub`: deterministico, nessun consenso richiesto.
- `openai`: usa Responses API e richiede `OPENAI_API_KEY`.
- `gemini`: usa Gemini API e richiede `GEMINI_API_KEY`.

Per provider esterni e' richiesto consenso assistente AI aggiornato (`Consent.type = 'AI_ASSISTANT'`).

Prompt effettivo:

- Contesto iniziale per area da `AiAreaGenerationConfig.initialContext`.
- Forma risposta da `AiAreaGenerationConfig.responseFormatPrompt`.
- Layout JSON questionari da `AiAreaGenerationConfig.questionnaireLayoutJson`.
- Prompt admin attivi da `AiPromptConfig`.
- Una sola configurazione `AiAreaGenerationConfig` per area; la migrazione crea lo stesso default iniziale per tutte le aree esistenti.
- Il nome del prompt e' univoco.
- Puo' esistere un solo prompt attivo per coppia area/livello; quando ne viene attivato uno nuovo, gli altri della stessa coppia vengono disattivati.
- Modificare testo o stato attivo aggiorna il prompt selezionato.
- Modificare nome, area o livello crea un nuovo prompt.
- Selezione prompt per:
  - globale o area specifica;
  - livello atleta (`BASELINE`, `STABLE`, `ADVANCED`);
  - versione attiva.
- Contesto atleta passato al modello, senza UUID o campi tecnici inutili:
  - anamnesi generale di onboarding;
  - anamnesi onboarding della sola area target;
  - livello area;
  - area target;
  - ranking e punteggio R/P/gap dell'area target;
  - riepilogo delle altre aree solo con nome e punteggi;
  - storico sintetico degli ultimi cicli della stessa area;
  - esercizi precedenti con stato, valutazione, note atleta e rifiuti;
  - domande e risposte dei questionari precedenti della stessa area.

Gli ID tecnici restano fuori dal prompt modello; quando servono per tracciamento sono gia' nelle colonne relazionali e negli audit DB.

Output AI:

- `summaryText`
- 1-3 `planItems`
- 3 domande di monitoraggio
- audit completo in `AiProposalAudit`

Il meccanismo di generazione, approvazione, pubblicazione e audit resta quello esistente.

## Ciclo Operativo

Generazione admin:

1. Admin sceglie atleta e area pronta.
2. Preview mostra provider, modello, prompt, schema e contesto.
3. Generazione crea `ImprovementPlanRelease` in `PENDING_APPROVAL`.
4. Crea `PlanItem` in `PROPOSED`.
5. Crea `QuestionSet` in `PENDING_APPROVAL`.
6. Crea approvazione per il coach collegato all'area.
7. Scrive `AiContextSummary`, `AiProposalAudit`, `CycleAuditLog`.

Approvazione coach:

- Il coach vede solo task coerenti con competenze e link atleta-area.
- Puo' approvare o rifiutare plan item e question set.
- Rifiuti restano nel contesto storico AI.

Pubblicazione admin:

- Possibile solo quando le approvazioni sono complete.
- Il ciclo diventa visibile all'atleta.

Chiusura:

- L'atleta completa attivita' e questionario.
- L'invio di tutte le risposte chiude direttamente il questionario, aggiorna snapshot e ranking.
- Il ciclo successivo per quell'area resta bloccato finche' il precedente non e' completo.

## Modelli Prisma Centrali

Utenti e accesso:

- `User`
- `Consent`
- `ProfessionalUserLink`
- `ProfessionalAreaCompetence`
- `DataAccessAudit`

Onboarding e prompt:

- `UserOnboardingAssessment`
- `OnboardingQuestionTemplate`
- `AiPromptConfig`
- `AiAreaGenerationConfig`

Performance e cicli:

- `CurrentState`
- `KpiDaily`
- `PerformanceProfileSnapshot`
- `PerformanceProfileSnapshotArea`
- `ImprovementPlanRelease`
- `PlanItem`
- `QuestionSet`
- `Question`
- `AnswerOption`
- `UserAnswer`
- `QuestionSetAreaApproval`
- `AiContextSummary`
- `AiProposalAudit`
- `CycleAuditLog`
- `PerformanceScaleConfig`

Legacy ancora presenti ma deprecati:

- `GuidanceContent`
- `UserAssignment`

## API Principali

Auth:

- `POST /api/auth/login`
- `POST /api/auth/register-athlete`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/token`

Admin:

- `GET /api/admin/dashboard`
- `PATCH /api/admin/users/:userId/activate`
- `PATCH /api/admin/users/:userId/deactivate`
- `GET /api/admin/ai-settings`
- `POST /api/admin/ai-prompts`
- `POST /api/admin/onboarding-templates`
- `POST /api/admin/maintenance/close-answered-questionnaires`
- `POST /api/admin/orchestrator/preview`
- `POST /api/admin/orchestrator/run`
- `POST /api/admin/cycles/:cycleId/publish`

Inspect/admin utilities:

- `GET /api/inspect/users`
- `POST /api/inspect/users`
- `GET /api/inspect/professionals`
- `POST /api/inspect/links`
- `POST /api/inspect/competences`
- `GET /api/inspect/cycles`

Onboarding:

- `GET /api/onboarding/questionnaire`
- `GET /api/onboarding/status`
- `POST /api/onboarding/submit`

Atleta:

- `GET /api/user/plan/current`
- `POST /api/user/plan-items/:id/complete`
- `GET /api/user/questions/current`
- `POST /api/questions/:setId/close`
- `GET /api/performance/profile/current`
- `GET /api/performance/profile/history`

Coach:

- `GET /api/professional/approvals`
- `POST /api/professional/questionsets/:id/approve`
- `POST /api/professional/questionsets/:id/reject`
- `POST /api/professional/plan-items/:id/approve`
- `POST /api/professional/plan-items/:id/reject`

## Web App

Route principali:

- `/login`: login e registrazione nuovo atleta.
- `/onboarding`: anamnesi iniziale dinamica.
- `/user`: dashboard atleta.
- `/user/plan`: piano attivo.
- `/user/questions`: check-in/questionario.
- `/user/performance`: performance e radar.
- `/professional`: atleti collegati.
- `/professional/approvals`: approvazioni coach.
- `/admin/cycles`: operations dashboard, attivazione utenti, assegnazioni, generazione, publish.
- `/admin/ai-config`: prompt AI e template anamnesi.
- `/admin/consents`: documenti privacy e assistente AI versionati, con hash.

La navigazione e' role-aware; un atleta con onboarding richiesto viene reindirizzato a `/onboarding`.

## Migrazioni

Sono presenti 22 migrazioni ordinate in `apps/api/prisma/migrations`.

Ultime migrazioni rilevanti:

```text
20260429110000_athlete_signup_ai_prompt_onboarding
20260429123000_ai_prompt_uniqueness
20260429142000_area_generation_config
20260503110000_goal_driven_ai_flow
20260504103000_auth_identity_google_oidc
20260504112000_required_privacy_ai_consents
20260505154000_consent_documents
```

Aggiunge:

- anagrafica minima utente (`firstName`, `lastName`);
- stato attivo/sospeso (`isActive`);
- profilo anamnestico in onboarding;
- template modificabili per questionari;
- prompt AI configurabili per area/livello.
- vincoli su nomi prompt e unico prompt attivo per area/livello;
- configurazione AI per area di contesto iniziale, forma risposta e layout JSON questionari.
- obiettivo atleta guidato da AI e prompt area personalizzati;
- identity provider Google OIDC;
- consensi privacy/AI obbligatori e versionati.

Comandi corretti:

```bash
cd apps/api
./node_modules/.bin/prisma validate
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate --schema prisma/schema.prisma --generator client
./node_modules/.bin/ts-node prisma/seed.ts
```

## Seed

Il seed crea o aggiorna:

- admin, atleta demo, coach generale e coach per area;
- 6 aree performance;
- competenze coach;
- link demo atleta-coach;
- scala performance attiva;
- 18 template onboarding;
- 7 prompt AI iniziali.
- 6 configurazioni AI per area con stesso default iniziale.

## Verifiche Eseguite

Verifiche passate durante l'ultimo aggiornamento:

- Prisma validate.
- Prisma generate client.
- Migrazione deploy sul DB configurato.
- Seed.
- API typecheck.
- Web typecheck.
- API build.
- Web build.
- Health API.
- Rendering pagina login.

## Stato Tecnico Attuale

Punti solidi:

- Flusso area-scoped coerente.
- Audit AI e ciclo presente.
- Privacy base rispettata: password non esposte nei select principali.
- Admin ha controllo su utenti, coach, prompt e anamnesi.
- Provider esterni subordinati a consenso AI.
- Consensi bloccanti lato API quando versione/hash non sono aggiornati.

Rischi e miglioramenti prossimi:

- I DTO non usano ancora `class-validator`; le validazioni principali sono nei service.
- Manca una UI per revocare consensi non necessari dopo registrazione.
- Mancano test e2e specifici per registrazione atleta sospeso, consensi versionati, registrazione Google, chiusura automatica questionario e pagine admin.
- La gestione versioni prompt incrementa `version` sul record esistente; non mantiene uno storico immutabile per ogni modifica.
