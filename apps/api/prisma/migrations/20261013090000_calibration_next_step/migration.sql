-- Motore della prossima domanda (PF-FS-PREPAYWALL §4.2, §10.2): l'AI decide
-- azione e numero di domande a ogni passo, senza quote fisse per driver.

ALTER TABLE "CalibrationRound" ADD COLUMN "action" TEXT,
ADD COLUMN "targetAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rationale" TEXT;

ALTER TABLE "CalibrationRound" ADD CONSTRAINT "CalibrationRound_action_check"
  CHECK ("action" IS NULL OR "action" IN ('ASK_SINGLE', 'ASK_GROUP', 'REQUEST_CLARIFICATION'));

ALTER TABLE "CalibrationConfig" DROP COLUMN "questionsPerDriver",
DROP COLUMN "driversPerRound";
