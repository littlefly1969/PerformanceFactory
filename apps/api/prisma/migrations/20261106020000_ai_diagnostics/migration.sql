ALTER TABLE "AiOperationLog"
  ADD COLUMN "diagnosticsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contextId" TEXT,
  ADD COLUMN "invocationInput" TEXT,
  ADD COLUMN "invocationOutput" TEXT,
  ADD COLUMN "errorDetail" JSONB;
CREATE INDEX "AiOperationLog_contextId_startedAt_idx" ON "AiOperationLog"("contextId", "startedAt");
ALTER TABLE "AiHttpAttempt" ADD COLUMN "request" JSONB, ADD COLUMN "response" JSONB, ADD COLUMN "captureState" TEXT;
CREATE TABLE "AiDiagnosticEvent" (
  "id" TEXT NOT NULL, "operationId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "attemptSequence" INTEGER, "phase" TEXT NOT NULL, "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDiagnosticEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiDiagnosticEvent_operationId_sequence_key" ON "AiDiagnosticEvent"("operationId", "sequence");
ALTER TABLE "AiDiagnosticEvent" ADD CONSTRAINT "AiDiagnosticEvent_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "AiOperationLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "AiDiagnosticControl" (
  "id" TEXT NOT NULL DEFAULT 'global', "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL, "updatedById" TEXT,
  CONSTRAINT "AiDiagnosticControl_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiDiagnosticControlChange" (
  "id" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDiagnosticControlChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiDiagnosticControlChange_createdAt_idx" ON "AiDiagnosticControlChange"("createdAt");
