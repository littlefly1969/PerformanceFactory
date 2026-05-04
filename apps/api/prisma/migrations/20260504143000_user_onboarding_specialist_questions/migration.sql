CREATE TABLE "UserOnboardingQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "inputType" "OnboardingInputType" NOT NULL DEFAULT 'SCORE',
    "optionsJson" JSONB,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOnboardingQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserOnboardingQuestion_userId_areaId_orderIndex_key"
    ON "UserOnboardingQuestion"("userId", "areaId", "orderIndex");

CREATE INDEX "UserOnboardingQuestion_userId_areaId_idx"
    ON "UserOnboardingQuestion"("userId", "areaId");

CREATE INDEX "UserOnboardingQuestion_areaId_idx"
    ON "UserOnboardingQuestion"("areaId");

ALTER TABLE "UserOnboardingQuestion"
    ADD CONSTRAINT "UserOnboardingQuestion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserOnboardingQuestion"
    ADD CONSTRAINT "UserOnboardingQuestion_areaId_fkey"
    FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
