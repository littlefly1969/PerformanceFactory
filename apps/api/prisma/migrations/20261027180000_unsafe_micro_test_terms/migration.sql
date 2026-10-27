-- Parole vietate nei micro-test generati dall'AI, gestite dall'amministratore nel back office.
ALTER TABLE "CalibrationConfig" ADD COLUMN "unsafeMicroTestTerms" TEXT[] DEFAULT ARRAY['diagnos', 'terapi', 'farmac', 'integrator', 'prescri', 'digiun', 'dieta ipocalorica', 'massimal', 'esaurimento', 'cedimento', 'salti ripetuti', 'sprint', 'dolore come']::TEXT[];
