-- Domande scritte dall AI a scelta multipla: la risposta e un elenco di valori.
ALTER TABLE "UserOnboardingQuestion" ADD COLUMN "multiple" BOOLEAN NOT NULL DEFAULT false;
