-- Segnalazioni interne sull'assessment (PF-FS-PREPAYWALL §5.3, OP-08): solo
-- ADMIN, mai mostrate all'atleta; una HIGH aperta sospende solo l'eleggibilità
-- alla lezione gratuita.

CREATE TABLE "AssessmentAnomaly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAnomaly_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssessmentAnomaly_kind_check" CHECK ("kind" IN ('CONTRADICTIONS', 'AUTOMATED_PATTERN', 'MICRO_TEST_MISMATCH')),
    CONSTRAINT "AssessmentAnomaly_priority_check" CHECK ("priority" IN ('LOW', 'HIGH')),
    CONSTRAINT "AssessmentAnomaly_status_check" CHECK ("status" IN ('OPEN', 'REVIEWED', 'ARCHIVED'))
);

CREATE INDEX "AssessmentAnomaly_userId_status_idx" ON "AssessmentAnomaly"("userId", "status");
CREATE INDEX "AssessmentAnomaly_status_createdAt_idx" ON "AssessmentAnomaly"("status", "createdAt");

ALTER TABLE "AssessmentAnomaly" ADD CONSTRAINT "AssessmentAnomaly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentAnomaly" ADD CONSTRAINT "AssessmentAnomaly_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentAnomaly" ADD CONSTRAINT "AssessmentAnomaly_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
