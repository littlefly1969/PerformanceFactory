-- Micro-test come passo del motore dell'assessment (PF-FS-PREPAYWALL §4.4):
-- l'AI lo propone tra i passi della calibrazione, niente limite giornaliero
-- e niente catalogo proposto in automatico nel pannello della lezione.

ALTER TABLE "CalibrationRound" DROP CONSTRAINT "CalibrationRound_action_check";
ALTER TABLE "CalibrationRound" ADD CONSTRAINT "CalibrationRound_action_check"
  CHECK ("action" IS NULL OR "action" IN ('ASK_SINGLE', 'ASK_GROUP', 'REQUEST_CLARIFICATION', 'PROPOSE_MICRO_TEST'));

ALTER TABLE "FreeLessonConfig" DROP COLUMN "microTestsPerDay";

-- I micro-test su misura nascono anche da un passo della calibrazione, senza
-- lotto: un lotto implica sempre un atleta, il catalogo non ha né l'uno né l'altro.
ALTER TABLE "MicroTest" DROP CONSTRAINT "MicroTest_owner_check";
ALTER TABLE "MicroTest" ADD CONSTRAINT "MicroTest_owner_check" CHECK ("generationId" IS NULL OR "userId" IS NOT NULL);
