-- Classifica FIT dichiarata dall'atleta: solo inserimenti, l'ultima riga è quella in vigore.
CREATE TABLE "AthleteFitRanking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "padelCurrent" TEXT NOT NULL,
    "padelBest" TEXT NOT NULL,
    "tennisCurrent" TEXT NOT NULL,
    "tennisBest" TEXT NOT NULL,
    "cardNumber" TEXT,
    "source" TEXT NOT NULL,
    "recalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteFitRanking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AthleteFitRanking_userId_createdAt_idx" ON "AthleteFitRanking"("userId", "createdAt");

ALTER TABLE "AthleteFitRanking" ADD CONSTRAINT "AthleteFitRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
