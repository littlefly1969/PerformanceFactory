CREATE TABLE "AiOperationLog" (
  "id" TEXT NOT NULL, "operation" TEXT NOT NULL, "provider" TEXT, "model" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING', "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3), "durationMs" INTEGER,
  "validationFailures" INTEGER NOT NULL DEFAULT 0,
  "validationCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "AiOperationLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiHttpAttempt" (
  "id" TEXT NOT NULL, "operationId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "provider" TEXT NOT NULL, "model" TEXT, "status" TEXT NOT NULL,
  "httpStatus" INTEGER, "durationMs" INTEGER NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiHttpAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiOperationLog_startedAt_idx" ON "AiOperationLog"("startedAt");
CREATE INDEX "AiOperationLog_status_startedAt_idx" ON "AiOperationLog"("status", "startedAt");
CREATE INDEX "AiOperationLog_operation_startedAt_idx" ON "AiOperationLog"("operation", "startedAt");
CREATE INDEX "AiOperationLog_provider_startedAt_idx" ON "AiOperationLog"("provider", "startedAt");
CREATE UNIQUE INDEX "AiHttpAttempt_operationId_sequence_key" ON "AiHttpAttempt"("operationId", "sequence");
ALTER TABLE "AiHttpAttempt" ADD CONSTRAINT "AiHttpAttempt_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "AiOperationLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
