-- «Quali sono i tuoi obiettivi?» a risposta multipla (decisione di Stefano del
-- 3 novembre 2026): stessa domanda obiettivo (target goalId), stesse opzioni
-- e stessi id; il programma parte dagli obiettivi scelti uniti in una frase.
-- Le bozze già aperte restano valide: ognuna ha congelato la sua versione.
UPDATE "OnboardingQuestionTemplate" SET
  "label" = 'Quali sono i tuoi obiettivi?',
  "helpText" = 'Il programma si costruisce intorno a questi.',
  "optionsJson" = jsonb_set("optionsJson", '{type}', '"multi_choice"'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_goal' AND "scope" = 'DISCOVERY';
