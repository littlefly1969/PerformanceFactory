ALTER TABLE "TrainingPlanRelease"
  ADD COLUMN "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'WAITING_APPROVALS',
  ADD COLUMN "specializationId" TEXT;

UPDATE "TrainingPlanRelease" release
SET "specializationId" = selection."specializationId"
FROM "UserSportSelection" selection
WHERE selection."userId" = release."userId"
  AND release."specializationId" IS NULL;

DELETE FROM "TrainingPlanRelease"
WHERE "specializationId" IS NULL;

ALTER TABLE "TrainingPlanRelease"
  ALTER COLUMN "specializationId" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';

CREATE INDEX "TrainingPlanRelease_specializationId_status_idx"
  ON "TrainingPlanRelease"("specializationId", "status");

ALTER TABLE "TrainingPlanRelease"
  ADD CONSTRAINT "TrainingPlanRelease_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TrainingPlanItem" (
  "id" TEXT NOT NULL,
  "trainingPlanReleaseId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "approvedByCoachId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "completionRating" INTEGER,
  CONSTRAINT "TrainingPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingPlanItem_trainingPlanReleaseId_status_idx"
  ON "TrainingPlanItem"("trainingPlanReleaseId", "status");

ALTER TABLE "TrainingPlanItem"
  ADD CONSTRAINT "TrainingPlanItem_trainingPlanReleaseId_fkey"
  FOREIGN KEY ("trainingPlanReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingPlanItem"
  ADD CONSTRAINT "TrainingPlanItem_approvedByCoachId_fkey"
  FOREIGN KEY ("approvedByCoachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TrainingQuestionSet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trainingPlanReleaseId" TEXT NOT NULL,
  "specializationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "TrainingQuestionSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingQuestionSet_userId_specializationId_status_createdAt_idx"
  ON "TrainingQuestionSet"("userId", "specializationId", "status", "createdAt");

ALTER TABLE "TrainingQuestionSet"
  ADD CONSTRAINT "TrainingQuestionSet_trainingPlanReleaseId_fkey"
  FOREIGN KEY ("trainingPlanReleaseId") REFERENCES "TrainingPlanRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingQuestionSet"
  ADD CONSTRAINT "TrainingQuestionSet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingQuestionSet"
  ADD CONSTRAINT "TrainingQuestionSet_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TrainingQuestion" (
  "id" TEXT NOT NULL,
  "trainingQuestionSetId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "objectiveRef" TEXT,
  "orderIndex" INTEGER NOT NULL,
  CONSTRAINT "TrainingQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingQuestion"
  ADD CONSTRAINT "TrainingQuestion_trainingQuestionSetId_fkey"
  FOREIGN KEY ("trainingQuestionSetId") REFERENCES "TrainingQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrainingAnswerOption" (
  "id" TEXT NOT NULL,
  "trainingQuestionId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "TrainingAnswerOption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingAnswerOption"
  ADD CONSTRAINT "TrainingAnswerOption_trainingQuestionId_fkey"
  FOREIGN KEY ("trainingQuestionId") REFERENCES "TrainingQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrainingUserAnswer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trainingQuestionId" TEXT NOT NULL,
  "trainingAnswerOptionId" TEXT,
  "scoreAwarded" DOUBLE PRECISION NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingUserAnswer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingUserAnswer"
  ADD CONSTRAINT "TrainingUserAnswer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingUserAnswer"
  ADD CONSTRAINT "TrainingUserAnswer_trainingQuestionId_fkey"
  FOREIGN KEY ("trainingQuestionId") REFERENCES "TrainingQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingUserAnswer"
  ADD CONSTRAINT "TrainingUserAnswer_trainingAnswerOptionId_fkey"
  FOREIGN KEY ("trainingAnswerOptionId") REFERENCES "TrainingAnswerOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TrainingQuestionSetCoachApproval" (
  "id" TEXT NOT NULL,
  "trainingQuestionSetId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedByCoachId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  CONSTRAINT "TrainingQuestionSetCoachApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingQuestionSetCoachApproval_trainingQuestionSetId_coachId_key"
  ON "TrainingQuestionSetCoachApproval"("trainingQuestionSetId", "coachId");

CREATE INDEX "TrainingQuestionSetCoachApproval_coachId_status_idx"
  ON "TrainingQuestionSetCoachApproval"("coachId", "status");

ALTER TABLE "TrainingQuestionSetCoachApproval"
  ADD CONSTRAINT "TrainingQuestionSetCoachApproval_trainingQuestionSetId_fkey"
  FOREIGN KEY ("trainingQuestionSetId") REFERENCES "TrainingQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingQuestionSetCoachApproval"
  ADD CONSTRAINT "TrainingQuestionSetCoachApproval_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingQuestionSetCoachApproval"
  ADD CONSTRAINT "TrainingQuestionSetCoachApproval_approvedByCoachId_fkey"
  FOREIGN KEY ("approvedByCoachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CoachSpecializationCompetence" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "specializationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachSpecializationCompetence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachSpecializationCompetence_coachId_specializationId_key"
  ON "CoachSpecializationCompetence"("coachId", "specializationId");

CREATE INDEX "CoachSpecializationCompetence_specializationId_idx"
  ON "CoachSpecializationCompetence"("specializationId");

ALTER TABLE "CoachSpecializationCompetence"
  ADD CONSTRAINT "CoachSpecializationCompetence_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachSpecializationCompetence"
  ADD CONSTRAINT "CoachSpecializationCompetence_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachUserLink" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "specializationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachUserLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachUserLink_userId_specializationId_key"
  ON "CoachUserLink"("userId", "specializationId");

CREATE INDEX "CoachUserLink_coachId_specializationId_idx"
  ON "CoachUserLink"("coachId", "specializationId");

ALTER TABLE "CoachUserLink"
  ADD CONSTRAINT "CoachUserLink_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachUserLink"
  ADD CONSTRAINT "CoachUserLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoachUserLink"
  ADD CONSTRAINT "CoachUserLink_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
