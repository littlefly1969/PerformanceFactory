-- Micro-test teorici e pratici (demo V10): luogo, passaggi e timer della
-- prova pratica, limite giornaliero per filtro e posti del giorno.
ALTER TABLE "CalibrationConfig" ADD COLUMN "microTestsPerDay" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "MicroTest" ADD COLUMN "format" TEXT,
ADD COLUMN "setting" TEXT,
ADD COLUMN "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "timerSeconds" INTEGER;

CREATE TABLE "MicroTestSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "filter" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "token" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "roundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MicroTestSlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MicroTestSlot_filter_check" CHECK ("filter" IN ('THEORY', 'ON_COURT', 'OFF_COURT')),
    CONSTRAINT "MicroTestSlot_status_check" CHECK ("status" IN ('PREPARING', 'READY')),
    CONSTRAINT "MicroTestSlot_slot_check" CHECK ("slot" >= 1)
);

CREATE UNIQUE INDEX "MicroTestSlot_roundId_key" ON "MicroTestSlot"("roundId");
CREATE UNIQUE INDEX "MicroTestSlot_userId_day_filter_slot_key" ON "MicroTestSlot"("userId", "day", "filter", "slot");
CREATE INDEX "MicroTestSlot_userId_filter_status_idx" ON "MicroTestSlot"("userId", "filter", "status");

ALTER TABLE "MicroTestSlot" ADD CONSTRAINT "MicroTestSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicroTestSlot" ADD CONSTRAINT "MicroTestSlot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CalibrationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
