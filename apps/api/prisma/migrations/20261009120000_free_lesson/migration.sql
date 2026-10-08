-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "freeLessonsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FreeLessonConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "creditsToUnlock" INTEGER NOT NULL DEFAULT 100,
    "creditsInitialAssessment" INTEGER NOT NULL DEFAULT 30,
    "creditsCalibrationRound" INTEGER NOT NULL DEFAULT 20,
    "creditsMicroTest" INTEGER NOT NULL DEFAULT 10,
    "microTestsPerDay" INTEGER NOT NULL DEFAULT 2,
    "minDaysBeforeDeadline" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "FreeLessonConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCreditEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroTest" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "optionsJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroTestCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "microTestId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroTestCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeLesson" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "coachId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "levelLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeLessonSeat" (
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "lessonId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "coachSharingAcceptedAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeLessonSeat_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CoachLessonFeedback" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coachId" TEXT,
    "areaId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "evaluationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachLessonFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InteractionCreditEntry_userId_createdAt_idx" ON "InteractionCreditEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCreditEntry_userId_sourceKey_key" ON "InteractionCreditEntry"("userId", "sourceKey");

-- CreateIndex
CREATE INDEX "MicroTest_areaId_isActive_idx" ON "MicroTest"("areaId", "isActive");

-- CreateIndex
CREATE INDEX "MicroTestCompletion_userId_completedAt_idx" ON "MicroTestCompletion"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MicroTestCompletion_userId_microTestId_key" ON "MicroTestCompletion"("userId", "microTestId");

-- CreateIndex
CREATE INDEX "FreeLesson_partnerId_startsAt_idx" ON "FreeLesson"("partnerId", "startsAt");

-- CreateIndex
CREATE INDEX "FreeLesson_coachId_startsAt_idx" ON "FreeLesson"("coachId", "startsAt");

-- CreateIndex
CREATE INDEX "FreeLessonSeat_lessonId_status_idx" ON "FreeLessonSeat"("lessonId", "status");

-- CreateIndex
CREATE INDEX "FreeLessonSeat_partnerId_status_idx" ON "FreeLessonSeat"("partnerId", "status");

-- CreateIndex
CREATE INDEX "CoachLessonFeedback_userId_evaluationId_idx" ON "CoachLessonFeedback"("userId", "evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachLessonFeedback_lessonId_userId_areaId_key" ON "CoachLessonFeedback"("lessonId", "userId", "areaId");

-- AddForeignKey
ALTER TABLE "FreeLessonConfig" ADD CONSTRAINT "FreeLessonConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCreditEntry" ADD CONSTRAINT "InteractionCreditEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTest" ADD CONSTRAINT "MicroTest_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTestCompletion" ADD CONSTRAINT "MicroTestCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTestCompletion" ADD CONSTRAINT "MicroTestCompletion_microTestId_fkey" FOREIGN KEY ("microTestId") REFERENCES "MicroTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeLesson" ADD CONSTRAINT "FreeLesson_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeLesson" ADD CONSTRAINT "FreeLesson_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "FreeLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLessonFeedback" ADD CONSTRAINT "CoachLessonFeedback_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "FreeLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLessonFeedback" ADD CONSTRAINT "CoachLessonFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLessonFeedback" ADD CONSTRAINT "CoachLessonFeedback_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachLessonFeedback" ADD CONSTRAINT "CoachLessonFeedback_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Vincoli di dominio: valgono anche per scritture fuori dall'API.
ALTER TABLE "FreeLesson" ADD CONSTRAINT "FreeLesson_capacity_check" CHECK ("capacity" BETWEEN 1 AND 8);
ALTER TABLE "FreeLesson" ADD CONSTRAINT "FreeLesson_status_check" CHECK ("status" IN ('SCHEDULED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_status_check" CHECK ("status" IN ('REQUESTED', 'ASSIGNED', 'ATTENDED', 'NO_SHOW', 'WITHDRAWN'));
-- Un posto assegnato o svolto appartiene sempre a una lezione.
ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_lesson_check" CHECK ("status" NOT IN ('ASSIGNED', 'ATTENDED', 'NO_SHOW') OR "lessonId" IS NOT NULL);
ALTER TABLE "CoachLessonFeedback" ADD CONSTRAINT "CoachLessonFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
