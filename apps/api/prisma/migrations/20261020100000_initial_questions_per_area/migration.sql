-- Domande conoscitive iniziali per driver, scritte dall'AI dopo la classifica FIT.
ALTER TABLE "CalibrationConfig" ADD COLUMN "initialQuestionsPerArea" INTEGER NOT NULL DEFAULT 2;
