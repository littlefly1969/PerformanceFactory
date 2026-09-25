-- Domande operative dell'assessment: alimentano i vincoli di allenamento e non il
-- Performance Index. Scope GENERAL (profilo, mai punteggio), ruolo semantico esplicito
-- e chiave uguale a quella letta da TrainingConstraintsService.
INSERT INTO "OnboardingQuestionTemplate"
  ("id","key","scope","areaId","label","helpText","inputType","optionsJson","required","orderIndex","isActive","updatedAt")
VALUES
  ('assessment_training_days_available','training_days_available','GENERAL',NULL,
   'Quanti giorni alla settimana puoi realisticamente allenarti?',NULL,'SELECT',
   '{"type":"single_choice","semanticRole":"TRAINING_AVAILABILITY_DAYS","contextKey":"training_days_available","locked":true,"options":[{"id":"1","label":"1 giorno","value":1},{"id":"2","label":"2 giorni","value":2},{"id":"3","label":"3 giorni","value":3},{"id":"4","label":"4 giorni","value":4},{"id":"5","label":"5 giorni","value":5},{"id":"6","label":"6 giorni","value":6},{"id":"7","label":"7 giorni","value":7}]}'::jsonb,
   true,1,true,CURRENT_TIMESTAMP),
  ('assessment_training_session_duration','training_session_duration','GENERAL',NULL,
   'Quanto tempo puoi dedicare mediamente a una sessione?',NULL,'SELECT',
   '{"type":"single_choice","semanticRole":"TRAINING_SESSION_DURATION","contextKey":"training_session_duration","locked":true,"options":[{"id":"30","label":"30 minuti","value":30},{"id":"45","label":"45 minuti","value":45},{"id":"60","label":"60 minuti","value":60},{"id":"90","label":"90 minuti","value":90},{"id":"120","label":"120+ minuti","value":120}]}'::jsonb,
   true,2,true,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Le stesse domande escono dalla discovery pubblica: l'atleta risponde una volta sola.
UPDATE "OnboardingQuestionTemplate"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('pf4_training_days_available', 'pf4_training_session_duration')
  AND "scope" = 'DISCOVERY';
