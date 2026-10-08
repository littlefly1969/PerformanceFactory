-- Specifica pre-paywall, slice 1: regole di confidence versionate.
-- Il consolidamento di R dipende solo dalla regola R_CONSOLIDATION: scadenza,
-- round di chiusura e lezione gratuita non consolidano più (PF-FS-PREPAYWALL §7).

-- CreateTable
CREATE TABLE "ConfidencePolicy" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "minOverallConfidence" INTEGER,
    "minAreaConfidence" INTEGER,
    "minAreasAtConfidence" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfidencePolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConfidencePolicy_kind_check" CHECK ("kind" IN ('R_CONSOLIDATION', 'LESSON_ELIGIBILITY')),
    CONSTRAINT "ConfidencePolicy_values_check" CHECK (
        ("minOverallConfidence" IS NULL OR "minOverallConfidence" BETWEEN 1 AND 100)
        AND ("minAreaConfidence" IS NULL OR "minAreaConfidence" BETWEEN 1 AND 100)
        AND ("minAreasAtConfidence" IS NULL OR "minAreasAtConfidence" BETWEEN 1 AND 20)
        AND ("minOverallConfidence" IS NOT NULL OR "minAreaConfidence" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfidencePolicy_kind_version_key" ON "ConfidencePolicy"("kind", "version");

-- AddForeignKey
ALTER TABLE "ConfidencePolicy" ADD CONSTRAINT "ConfidencePolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prima versione: il consolidamento riprende la soglia di calibrazione in uso,
-- sia complessiva sia per area; la lezione parte da una confidence complessiva
-- di 50. Valori provvisori da approvare, modificabili dal back office.
INSERT INTO "ConfidencePolicy" ("id", "kind", "version", "minOverallConfidence", "minAreaConfidence", "note")
SELECT gen_random_uuid()::text, 'R_CONSOLIDATION', 1, t.threshold, t.threshold,
       'Versione iniziale dalla soglia di calibrazione precedente (provvisoria, da approvare)'
FROM (SELECT COALESCE((SELECT "confidenceThreshold" FROM "CalibrationConfig" WHERE "id" = 'default'), 70) AS threshold) t;

INSERT INTO "ConfidencePolicy" ("id", "kind", "version", "minOverallConfidence", "note")
VALUES (gen_random_uuid()::text, 'LESSON_ELIGIBILITY', 1, 50, 'Versione iniziale (provvisoria, da approvare)');

-- AlterTable
ALTER TABLE "AssessmentEvaluation" ADD COLUMN "consolidationPolicyId" TEXT;
ALTER TABLE "AthleteCalibration" ADD COLUMN "consolidationPolicyId" TEXT;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluation" ADD CONSTRAINT "AssessmentEvaluation_consolidationPolicyId_fkey" FOREIGN KEY ("consolidationPolicyId") REFERENCES "ConfidencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteCalibration" ADD CONSTRAINT "AthleteCalibration_consolidationPolicyId_fkey" FOREIGN KEY ("consolidationPolicyId") REFERENCES "ConfidencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Calibrazioni chiuse per scadenza o round di chiusura con evidenze sotto la
-- regola (AT-27): R torna provvisoria e il percorso riprende. Restano chiuse
-- quelle con un abbonamento attivo, che hanno già superato il paywall.
WITH policy AS (
    SELECT "minOverallConfidence" AS overall, "minAreaConfidence" AS area
    FROM "ConfidencePolicy" WHERE "kind" = 'R_CONSOLIDATION' AND "version" = 1
),
weak AS (
    SELECT c."userId", e."id" AS "evaluationId"
    FROM "AthleteCalibration" c
    CROSS JOIN policy p
    JOIN LATERAL (
        SELECT ev."id", ev."overallConfidence"
        FROM "AssessmentEvaluation" ev
        WHERE ev."userId" = c."userId" AND ev."status" = 'CONSOLIDATED'
        ORDER BY ev."sequence" DESC
        LIMIT 1
    ) e ON TRUE
    WHERE c."status" IN ('CALIBRATION_COMPLETED', 'PAYWALL_READY')
      AND c."completionReason" IN ('DEADLINE_REACHED', 'CLOSING_ASSESSMENT')
      AND (
        e."overallConfidence" < p.overall
        OR EXISTS (
            SELECT 1 FROM "AssessmentEvaluationArea" a
            WHERE a."evaluationId" = e."id" AND a."confidence" < p.area
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Subscription" s
        WHERE s."userId" = c."userId" AND s."status" IN ('ACTIVE', 'PAYMENT_GRACE')
      )
),
reopened AS (
    UPDATE "AthleteCalibration" c
    SET "status" = CASE WHEN c."levelEstimatedAt" IS NULL THEN 'FREE_CALIBRATING' ELSE 'FREE_LEVEL_ESTIMATED' END,
        "completedAt" = NULL,
        "completionReason" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM weak w
    WHERE c."userId" = w."userId"
    RETURNING w."evaluationId"
)
UPDATE "AssessmentEvaluation" e
SET "status" = 'PROVISIONAL'
FROM reopened r
WHERE e."id" = r."evaluationId";

-- AlterTable: soglia spostata nella regola, niente attese né round di chiusura.
ALTER TABLE "CalibrationConfig" DROP COLUMN "closingDay",
DROP COLUMN "confidenceThreshold",
DROP COLUMN "minHoursBetweenRounds";
