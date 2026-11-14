-- CreateTable
CREATE TABLE "RankingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "realWeight" INTEGER NOT NULL DEFAULT 60,
    "potentialWeight" INTEGER NOT NULL DEFAULT 40,
    "pf1Min" INTEGER NOT NULL DEFAULT 80,
    "pf2Min" INTEGER NOT NULL DEFAULT 66,
    "pf3Min" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "RankingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingConfigChange" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingAnnouncement" (
    "userId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingAnnouncement_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "RankingConfigChange_createdAt_idx" ON "RankingConfigChange"("createdAt");

-- CreateIndex
CREATE INDEX "RankingConfigChange_actorId_idx" ON "RankingConfigChange"("actorId");

-- AddForeignKey
ALTER TABLE "RankingConfig" ADD CONSTRAINT "RankingConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingConfigChange" ADD CONSTRAINT "RankingConfigChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingAnnouncement" ADD CONSTRAINT "RankingAnnouncement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
