-- Micro-test scritti dall'AI per il singolo atleta, accanto al catalogo del back office.

-- AlterTable
ALTER TABLE "MicroTest" ADD COLUMN     "generationId" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "MicroTestGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "provider" TEXT,
    "model" TEXT,
    "promptVersionId" TEXT,
    "promptHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroTestGeneration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MicroTestGeneration_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'READY', 'FAILED')),
    CONSTRAINT "MicroTestGeneration_attempts_check" CHECK ("attempts" >= 0)
);

-- Un test del catalogo non ha atleta né lotto; un test AI li ha entrambi.
ALTER TABLE "MicroTest" ADD CONSTRAINT "MicroTest_owner_check" CHECK (("userId" IS NULL) = ("generationId" IS NULL));

-- CreateIndex
CREATE INDEX "MicroTestGeneration_userId_status_createdAt_idx" ON "MicroTestGeneration"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MicroTestGeneration_userId_evaluationId_key" ON "MicroTestGeneration"("userId", "evaluationId");

-- CreateIndex
CREATE INDEX "MicroTest_userId_isActive_idx" ON "MicroTest"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MicroTest_generationId_idx" ON "MicroTest"("generationId");

-- AddForeignKey
ALTER TABLE "MicroTest" ADD CONSTRAINT "MicroTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTest" ADD CONSTRAINT "MicroTest_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "MicroTestGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTestGeneration" ADD CONSTRAINT "MicroTestGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroTestGeneration" ADD CONSTRAINT "MicroTestGeneration_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AssessmentEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
