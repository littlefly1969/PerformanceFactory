-- The event date belongs only to the branches with an upcoming event.
-- Preserve all other template settings, and any condition already customized.
UPDATE "OnboardingQuestionTemplate"
SET "optionsJson" = "optionsJson" || '{"visibleWhen":{"match":"all","rules":[{"question":"pf4_event","operator":"in","values":["0","1","2"]}]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_event_date' AND NOT ("optionsJson" ? 'visibleWhen');
