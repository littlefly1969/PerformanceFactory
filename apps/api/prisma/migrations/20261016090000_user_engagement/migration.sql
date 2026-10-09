-- Dormienza a 10 giorni (PF-FS-PREPAYWALL §8): lo stato di engagement dipende
-- solo dall'ultima interazione significativa. Il job lo aggiorna con
-- transizioni condizionali, quindi ogni passaggio produce un solo evento.

CREATE TABLE "UserEngagement" (
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE_RECENT',
    "lastMeaningfulAt" TIMESTAMP(3) NOT NULL,
    "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wakeupSentAt" TIMESTAMP(3),
    "reactivatedAt" TIMESTAMP(3),

    CONSTRAINT "UserEngagement_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "UserEngagement_state_check" CHECK ("state" IN ('ACTIVE_RECENT', 'SLEEPY', 'DORMANT', 'REACTIVATED'))
);

CREATE INDEX "UserEngagement_state_lastMeaningfulAt_idx" ON "UserEngagement"("state", "lastMeaningfulAt");

ALTER TABLE "UserEngagement" ADD CONSTRAINT "UserEngagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Atleti esistenti: l'ultima valutazione è la migliore evidenza disponibile
-- dell'ultima interazione significativa; altrimenti vale la registrazione.
INSERT INTO "UserEngagement" ("userId", "lastMeaningfulAt")
SELECT u."id", GREATEST(u."createdAt", COALESCE(MAX(e."createdAt"), u."createdAt"))
FROM "User" u
LEFT JOIN "AssessmentEvaluation" e ON e."userId" = u."id"
WHERE u."role" = 'USER'
GROUP BY u."id", u."createdAt";
