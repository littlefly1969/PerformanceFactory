-- Review Ingresso: eventId degli eventi, autori dei flag collegati a User, registro dei beta tester.
-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "FeatureFlagChange" ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BetaTesterChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "before" BOOLEAN NOT NULL,
    "after" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaTesterChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetaTesterChange_userId_createdAt_idx" ON "BetaTesterChange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BetaTesterChange_actorId_idx" ON "BetaTesterChange"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_eventId_key" ON "AnalyticsEvent"("eventId");

-- CreateIndex
CREATE INDEX "FeatureFlagChange_actorId_idx" ON "FeatureFlagChange"("actorId");

-- Autori non più esistenti: la riga resta, senza autore, prima del vincolo.
UPDATE "FeatureFlag" f SET "updatedById" = NULL
WHERE f."updatedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = f."updatedById");
UPDATE "FeatureFlagChange" c SET "actorId" = NULL
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = c."actorId");

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlagChange" ADD CONSTRAINT "FeatureFlagChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaTesterChange" ADD CONSTRAINT "BetaTesterChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaTesterChange" ADD CONSTRAINT "BetaTesterChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
