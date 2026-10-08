-- Lezione gratuita per confidence e disponibilità (PF-FS-PREPAYWALL §6.2, §10.3).

-- Rinuncia esplicita alla lezione: R si consolida con la sola regola.
ALTER TABLE "AthleteCalibration" ADD COLUMN "lessonDeclinedAt" TIMESTAMP(3);

-- Decisione di eleggibilità registrata sul posto richiesto.
ALTER TABLE "FreeLessonSeat" ADD COLUMN "eligibilityPolicyId" TEXT,
ADD COLUMN "eligibilityEvaluationId" TEXT;

ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_eligibilityPolicyId_fkey" FOREIGN KEY ("eligibilityPolicyId") REFERENCES "ConfidencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_eligibilityEvaluationId_fkey" FOREIGN KEY ("eligibilityEvaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- R non si chiude più a scadenza: la lezione non deve cadere prima di una data.
ALTER TABLE "FreeLessonConfig" DROP COLUMN "minDaysBeforeDeadline";
