-- V2+ domain realignment: new performance/plan/question/answer models
-- Note: apply this migration on top of the existing schema (do not use on empty DBs).

DO $$ BEGIN
  CREATE TYPE "CycleStatus" AS ENUM ('PROPOSED','WAITING_APPROVALS','READY_TO_PUBLISH','PUBLISHED','CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "PerformanceProfileSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rankingGlobal" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceProfileSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerformanceProfileSnapshotArea" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "realR" DOUBLE PRECISION NOT NULL,
    "potentialP" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "PerformanceProfileSnapshotArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImprovementPlanRelease" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "generatedBy" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'PROPOSED',
    "sourceSnapshotId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "publishedByAdminId" TEXT,
    "proposedByAdminId" TEXT,
    CONSTRAINT "ImprovementPlanRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planReleaseId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "approvedByProfessionalId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planReleaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "QuestionSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "objectiveRef" TEXT,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnswerOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "AnswerOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerOptionId" TEXT,
    "scoreAwarded" DOUBLE PRECISION NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiContextSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'PROPOSED',
    "planReleaseId" TEXT,
    CONSTRAINT "AiContextSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerformanceScaleConfig" (
    "id" TEXT NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "potentialStep" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "thresholdRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceScaleConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionSetAreaApproval" (
    "id" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "QuestionSetAreaApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalAreaCompetence" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfessionalAreaCompetence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CycleAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planReleaseId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CycleAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformanceProfileSnapshotArea_snapshotId_areaId_key"
  ON "PerformanceProfileSnapshotArea"("snapshotId", "areaId");

CREATE UNIQUE INDEX "ImprovementPlanRelease_userId_version_key"
  ON "ImprovementPlanRelease"("userId", "version");

-- Enforce a single ACTIVE plan per user at the DB layer.
CREATE UNIQUE INDEX "ImprovementPlanRelease_userId_active_key"
  ON "ImprovementPlanRelease"("userId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "ImprovementPlanRelease_userId_status_createdAt_idx"
  ON "ImprovementPlanRelease"("userId", "status", "createdAt");

CREATE INDEX "QuestionSet_userId_status_createdAt_idx"
  ON "QuestionSet"("userId", "status", "createdAt");

-- Enforce a single active scale config.
CREATE UNIQUE INDEX "PerformanceScaleConfig_single_active_key"
  ON "PerformanceScaleConfig"("isActive")
  WHERE "isActive" = true;

CREATE UNIQUE INDEX "QuestionSetAreaApproval_questionSetId_areaId_key"
  ON "QuestionSetAreaApproval"("questionSetId", "areaId");

CREATE INDEX "QuestionSetAreaApproval_professionalId_status_idx"
  ON "QuestionSetAreaApproval"("professionalId", "status");

CREATE UNIQUE INDEX "ProfessionalAreaCompetence_professionalId_areaId_key"
  ON "ProfessionalAreaCompetence"("professionalId", "areaId");

CREATE INDEX "CycleAuditLog_userId_createdAt_idx"
  ON "CycleAuditLog"("userId", "createdAt");

ALTER TABLE "PerformanceProfileSnapshot"
  ADD CONSTRAINT "PerformanceProfileSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformanceProfileSnapshotArea"
  ADD CONSTRAINT "PerformanceProfileSnapshotArea_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "PerformanceProfileSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformanceProfileSnapshotArea"
  ADD CONSTRAINT "PerformanceProfileSnapshotArea_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImprovementPlanRelease"
  ADD CONSTRAINT "ImprovementPlanRelease_sourceSnapshotId_fkey"
  FOREIGN KEY ("sourceSnapshotId") REFERENCES "PerformanceProfileSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImprovementPlanRelease"
  ADD CONSTRAINT "ImprovementPlanRelease_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanItem"
  ADD CONSTRAINT "PlanItem_planReleaseId_fkey"
  FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanItem"
  ADD CONSTRAINT "PlanItem_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanItem"
  ADD CONSTRAINT "PlanItem_approvedByProfessionalId_fkey"
  FOREIGN KEY ("approvedByProfessionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImprovementPlanRelease"
  ADD CONSTRAINT "ImprovementPlanRelease_publishedByAdminId_fkey"
  FOREIGN KEY ("publishedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImprovementPlanRelease"
  ADD CONSTRAINT "ImprovementPlanRelease_proposedByAdminId_fkey"
  FOREIGN KEY ("proposedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuestionSet"
  ADD CONSTRAINT "QuestionSet_planReleaseId_fkey"
  FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionSet"
  ADD CONSTRAINT "QuestionSet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_questionSetId_fkey"
  FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnswerOption"
  ADD CONSTRAINT "AnswerOption_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserAnswer"
  ADD CONSTRAINT "UserAnswer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserAnswer"
  ADD CONSTRAINT "UserAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserAnswer"
  ADD CONSTRAINT "UserAnswer_answerOptionId_fkey"
  FOREIGN KEY ("answerOptionId") REFERENCES "AnswerOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiContextSummary"
  ADD CONSTRAINT "AiContextSummary_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiContextSummary"
  ADD CONSTRAINT "AiContextSummary_planReleaseId_fkey"
  FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuestionSetAreaApproval"
  ADD CONSTRAINT "QuestionSetAreaApproval_questionSetId_fkey"
  FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionSetAreaApproval"
  ADD CONSTRAINT "QuestionSetAreaApproval_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionSetAreaApproval"
  ADD CONSTRAINT "QuestionSetAreaApproval_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalAreaCompetence"
  ADD CONSTRAINT "ProfessionalAreaCompetence_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalAreaCompetence"
  ADD CONSTRAINT "ProfessionalAreaCompetence_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CycleAuditLog"
  ADD CONSTRAINT "CycleAuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CycleAuditLog"
  ADD CONSTRAINT "CycleAuditLog_planReleaseId_fkey"
  FOREIGN KEY ("planReleaseId") REFERENCES "ImprovementPlanRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CycleAuditLog"
  ADD CONSTRAINT "CycleAuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
