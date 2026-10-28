-- Parole vietate negli allenamenti generati dall'AI, gestite dall'amministratore; vuota di partenza.
ALTER TABLE "CalibrationConfig" ADD COLUMN "unsafeTrainingTerms" TEXT[] DEFAULT ARRAY[]::TEXT[];
