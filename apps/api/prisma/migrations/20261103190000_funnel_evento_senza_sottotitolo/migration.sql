-- Rifiniture del funnel PF10 (note di Stefano del 3 novembre 2026): sotto
-- «Hai un evento importante in arrivo?» non c'è più il testo grigio. Cambia
-- solo il testo d'aiuto: opzioni, valori e diramazioni restano come sono, e le
-- versioni precedenti dell'app funzionano anche senza.
UPDATE "OnboardingQuestionTemplate" SET
  "helpText" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pf4_event' AND "scope" = 'DISCOVERY';
