-- Funnel allineato alla demo PF10 (decisione di Stefano del 2 novembre 2026):
-- motivazione e limitazioni diventano a scelta multipla con un'opzione
-- esclusiva, esperienza e frequenza si mostrano con il selettore − / + sulle
-- fasce esistenti (valori invariati: training-constraints li legge), la data
-- dell'evento resta con la sua diramazione. Ordine e obbligatorietà invariati.
-- Riscrive solo le domande DISCOVERY del funnel, anche se modificate da back
-- office, così ogni installazione parte dallo stesso questionario.

UPDATE "OnboardingQuestionTemplate" SET
  "optionsJson" = '{"type": "single_choice", "contextKey": "general_age_range", "options": [{"id": "0", "label": "18-29", "value": "18-29"}, {"id": "1", "label": "30-39", "value": "30-39"}, {"id": "2", "label": "40-49", "value": "40-49"}, {"id": "3", "label": "50+", "value": "50+"}], "ui": {"presentation": "cards", "columns": 2, "unit": "anni", "summaryLabel": "Età"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_age' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Perché giochi a padel?',
  "helpText" = 'Non c''è una risposta migliore delle altre.',
  "optionsJson" = '{"type": "multi_choice", "options": [{"id": "0", "label": "Per vincere", "value": "Per vincere"}, {"id": "1", "label": "Per restare in forma", "value": "Per restare in forma"}, {"id": "2", "label": "Per stare in compagnia", "value": "Per stare in compagnia"}, {"id": "3", "label": "Per staccare dalla giornata", "value": "Per staccare dalla giornata"}, {"id": "none", "label": "Nessuna delle altre", "value": "Nessuna delle altre", "exclusive": true}], "ui": {"summaryLabel": "Motivazione"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_motivation' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Da quanto tempo pratichi?',
  "helpText" = NULL,
  "optionsJson" = '{"type": "single_choice", "options": [{"id": "0", "label": "Meno di un anno", "value": "Meno di un anno"}, {"id": "1", "label": "1-3 anni", "value": "1-3 anni"}, {"id": "2", "label": "3-5 anni", "value": "3-5 anni"}, {"id": "3", "label": "Più di 5 anni", "value": "Più di 5 anni"}], "ui": {"presentation": "stepper", "summaryLabel": "Esperienza"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_experience' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Quante volte ti alleni a settimana?',
  "helpText" = NULL,
  "optionsJson" = '{"type": "single_choice", "contextKey": "general_training_frequency", "options": [{"id": "0", "label": "1-2 volte", "value": "1-2 volte"}, {"id": "1", "label": "3-4 volte", "value": "3-4 volte"}, {"id": "2", "label": "5 o più volte", "value": "5 o più volte"}], "ui": {"presentation": "stepper", "summaryLabel": "Frequenza"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_frequency' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Hai dolori o limitazioni fisiche?',
  "helpText" = NULL,
  "optionsJson" = '{"type": "multi_choice", "contextKey": "general_health_status", "options": [{"id": "gomito", "label": "Gomito", "value": "Gomito"}, {"id": "spalla", "label": "Spalla", "value": "Spalla"}, {"id": "ginocchio", "label": "Ginocchio", "value": "Ginocchio"}, {"id": "caviglia", "label": "Caviglia", "value": "Caviglia"}, {"id": "schiena", "label": "Schiena", "value": "Schiena"}, {"id": "nessuno", "label": "Nessuno", "value": "Nessuno", "exclusive": true}], "ui": {"summaryLabel": "Limitazioni"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_limitations' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Qual è il tuo obiettivo principale?',
  "helpText" = 'Il programma si costruisce intorno a questo.',
  "optionsJson" = '{"type": "single_choice", "target": "goalId", "options": [{"id": "0", "label": "Migliorare la tecnica", "value": "Migliorare la tecnica"}, {"id": "1", "label": "Aumentare la resistenza", "value": "Aumentare la resistenza"}, {"id": "2", "label": "Perdere peso", "value": "Perdere peso"}, {"id": "3", "label": "Prevenire gli infortuni", "value": "Prevenire gli infortuni"}], "ui": {"summaryLabel": "Obiettivo"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_goal' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Hai un evento importante in arrivo?',
  "helpText" = 'Avere una data ti aiuta a restare costante.',
  "optionsJson" = '{"type": "single_choice", "options": [{"id": "0", "label": "Un torneo", "value": "Un torneo"}, {"id": "1", "label": "Un campionato", "value": "Un campionato"}, {"id": "2", "label": "Una vacanza", "value": "Una vacanza"}, {"id": "3", "label": "Nessuno in particolare", "value": "Nessuno in particolare"}], "ui": {"summaryLabel": "Evento"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_event' AND "scope" = 'DISCOVERY';

UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Quando è il tuo evento?',
  "helpText" = 'Lo terremo in considerazione per il tuo obiettivo.',
  "optionsJson" = '{"type": "date", "contextKey": "general_event_date", "visibleWhen": {"match": "all", "rules": [{"question": "pf4_event", "operator": "in", "values": ["0", "1", "2"]}]}, "ui": {"summaryLabel": "Data evento"}}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_event_date' AND "scope" = 'DISCOVERY';

-- Bozze anonime del quiz: ognuna congela la configurazione con cui è nata e
-- riprenderebbe il questionario vecchio fino a 7 giorni. Sono dati di test e
-- non appartengono a nessun account; utenti e profili registrati restano.
DELETE FROM "QuizDraft";
