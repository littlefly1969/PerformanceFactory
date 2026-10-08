-- Slice Scenari: P3/P6/P12 per driver, orizzonte scelto, durate del programma in mesi.
-- AlterTable
ALTER TABLE "AthleteDiscovery" ADD COLUMN     "horizonSelectedAt" TIMESTAMP(3),
ADD COLUMN     "programHorizon" "ProgramHorizon";

-- CreateTable
CREATE TABLE "PotentialScenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "horizon" "ProgramHorizon" NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "confidence" INTEGER NOT NULL,
    "assumptions" JSONB NOT NULL,
    "engine" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PotentialScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PotentialScenario_userId_computedAt_idx" ON "PotentialScenario"("userId", "computedAt");

-- CreateIndex
CREATE INDEX "PotentialScenario_areaId_idx" ON "PotentialScenario"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "PotentialScenario_evaluationId_engine_engineVersion_horizon_key" ON "PotentialScenario"("evaluationId", "engine", "engineVersion", "horizon", "areaId");

-- AddForeignKey
ALTER TABLE "PotentialScenario" ADD CONSTRAINT "PotentialScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotentialScenario" ADD CONSTRAINT "PotentialScenario_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotentialScenario" ADD CONSTRAINT "PotentialScenario_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durate del programma: 4/12/52 settimane diventano 3/6/12 mesi (12/26/52 settimane).
-- 4 e 12 settimane rientrano nel programma di 3 mesi, 52 in quello di 12 mesi.
UPDATE "AthleteDiscovery" SET "programHorizon" = 'PROGRAM_3M', "programDurationWeeks" = 12
WHERE "programDurationWeeks" IN (4, 12);
UPDATE "AthleteDiscovery" SET "programHorizon" = 'PROGRAM_12M'
WHERE "programDurationWeeks" = 52;
UPDATE "UserOnboardingAssessment"
SET "profileJson" = jsonb_set("profileJson", '{program_duration_weeks,value}', '12'::jsonb)
WHERE "profileJson" #>> '{program_duration_weeks,value}' IN ('4', '12');
