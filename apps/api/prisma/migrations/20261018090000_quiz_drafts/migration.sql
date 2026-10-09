-- Bozza anonima del Quiz Funnel lato server (PF-FS-PREPAYWALL F1, AT-04):
-- token solo come hash, configurazione congelata, scadenza mobile di 7 giorni.
CREATE TABLE "QuizDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "configuration" JSONB NOT NULL,
    "draft" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuizDraft_tokenHash_key" ON "QuizDraft"("tokenHash");
CREATE INDEX "QuizDraft_expiresAt_idx" ON "QuizDraft"("expiresAt");
