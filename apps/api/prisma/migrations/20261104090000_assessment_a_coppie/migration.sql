-- La disponibilità (giorni e durata) esce dall'assessment: si compila nel
-- profilo. La sequenza diventa solo le domande dei driver, scritte dall'AI a
-- coppie. Il cursore degli assessment in corso perde le 2 domande operative
-- iniziali; le risposte già date restano salvate come contesto.
UPDATE "AthleteDiscovery" d
SET "currentQuestion" = GREATEST(d."currentQuestion" - 2, 0)
WHERE d."phase" = 'ASSESSMENT'
  AND d."baselineId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AssessmentEvaluation" e WHERE e."userId" = d."userId"
  );
