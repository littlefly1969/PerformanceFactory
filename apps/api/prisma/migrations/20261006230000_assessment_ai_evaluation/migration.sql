-- AlterTable
ALTER TABLE "AiPromptVersion" ADD COLUMN     "assessmentPromptConfigId" TEXT;

-- CreateTable
CREATE TABLE "AiAssessmentPromptConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrompt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activePromptVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AiAssessmentPromptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentEvaluation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONAL',
    "source" TEXT NOT NULL DEFAULT 'SELF_ASSESSMENT',
    "summary" TEXT NOT NULL,
    "overallConfidence" INTEGER NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "promptHash" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentEvaluationArea" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceGaps" JSONB NOT NULL,

    CONSTRAINT "AssessmentEvaluationArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAssessmentPromptConfig_name_key" ON "AiAssessmentPromptConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AiAssessmentPromptConfig_activePromptVersionId_key" ON "AiAssessmentPromptConfig"("activePromptVersionId");

-- CreateIndex
CREATE INDEX "AiAssessmentPromptConfig_isActive_version_idx" ON "AiAssessmentPromptConfig"("isActive", "version");

-- CreateIndex
CREATE INDEX "AssessmentEvaluation_userId_createdAt_idx" ON "AssessmentEvaluation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentEvaluationArea_areaId_idx" ON "AssessmentEvaluationArea"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentEvaluationArea_evaluationId_areaId_key" ON "AssessmentEvaluationArea"("evaluationId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptVersion_assessmentPromptConfigId_version_key" ON "AiPromptVersion"("assessmentPromptConfigId", "version");

-- AddForeignKey
ALTER TABLE "AiPromptVersion" ADD CONSTRAINT "AiPromptVersion_assessmentPromptConfigId_fkey" FOREIGN KEY ("assessmentPromptConfigId") REFERENCES "AiAssessmentPromptConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssessmentPromptConfig" ADD CONSTRAINT "AiAssessmentPromptConfig_activePromptVersionId_fkey" FOREIGN KEY ("activePromptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluation" ADD CONSTRAINT "AssessmentEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluation" ADD CONSTRAINT "AssessmentEvaluation_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "AiPromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluationArea" ADD CONSTRAINT "AssessmentEvaluationArea_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEvaluationArea" ADD CONSTRAINT "AssessmentEvaluationArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

