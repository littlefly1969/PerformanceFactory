-- Indicazione al motore di calibrazione: una micro-prova ogni N domande; 0 = nessuna.
ALTER TABLE "CalibrationConfig" ADD COLUMN "questionsPerMicroTest" INTEGER NOT NULL DEFAULT 0;
