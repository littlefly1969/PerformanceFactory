-- Slice Calibrazione: stato del percorso, round adattivi, livello e commitment.
-- AlterTable
ALTER TABLE "AiAssessmentPromptConfig" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EVALUATION';

-- AlterTable
ALTER TABLE "AssessmentEvaluation" ADD COLUMN     "level" TEXT,
ADD COLUMN     "levelConfidence" INTEGER;

-- AlterTable
ALTER TABLE "AssessmentEvaluationArea" ADD COLUMN     "commitment" TEXT;

-- CreateTable
CREATE TABLE "AthleteCalibration" (
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FREE_CALIBRATING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "levelEstimatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completionReason" TEXT,
    "operationAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteCalibration_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CalibrationRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ADAPTIVE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "questionsJson" JSONB NOT NULL,
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "promptHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "evaluationId" TEXT,

    CONSTRAINT "CalibrationRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 70,
    "levelConfidenceThreshold" INTEGER NOT NULL DEFAULT 50,
    "maxDays" INTEGER NOT NULL DEFAULT 30,
    "closingDay" INTEGER NOT NULL DEFAULT 25,
    "questionsPerDriver" INTEGER NOT NULL DEFAULT 2,
    "driversPerRound" INTEGER NOT NULL DEFAULT 2,
    "minHoursBetweenRounds" INTEGER NOT NULL DEFAULT 20,
    "trainingDuringCalibration" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "CalibrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AthleteCalibration_status_deadlineAt_idx" ON "AthleteCalibration"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationRound_evaluationId_key" ON "CalibrationRound"("evaluationId");

-- CreateIndex
CREATE INDEX "CalibrationRound_userId_status_idx" ON "CalibrationRound"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationRound_userId_sequence_key" ON "CalibrationRound"("userId", "sequence");

-- CreateIndex
CREATE INDEX "AiAssessmentPromptConfig_kind_isActive_idx" ON "AiAssessmentPromptConfig"("kind", "isActive");

-- AddForeignKey
ALTER TABLE "AthleteCalibration" ADD CONSTRAINT "AthleteCalibration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRound" ADD CONSTRAINT "CalibrationRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRound" ADD CONSTRAINT "CalibrationRound_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationConfig" ADD CONSTRAINT "CalibrationConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
