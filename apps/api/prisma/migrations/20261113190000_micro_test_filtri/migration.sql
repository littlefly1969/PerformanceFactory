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

-- BACKFILL-MICRO-TEST-SLOTS
-- I micro-test della home proposti oggi (giorno italiano) prima del rilascio
-- occupano già i loro posti, anche se saltati: il limite giornaliero per
-- filtro vale anche nel giorno del deploy. Filtro dalla forma del test:
-- situazioni = THEORY, prova pratica = il suo luogo, o ON_COURT se non ce l'ha
-- (stessa regola del codice per i test storici). Idempotente.
INSERT INTO "MicroTestSlot" ("id", "userId", "day", "filter", "slot", "status", "claimedAt", "roundId", "createdAt")
SELECT gen_random_uuid()::text, r."userId", r."day", r."filter",
       ROW_NUMBER() OVER (PARTITION BY r."userId", r."day", r."filter" ORDER BY r."createdAt", r."id"),
       'READY', r."createdAt", r."id", CURRENT_TIMESTAMP
FROM (
  SELECT cr."id", cr."userId", cr."createdAt",
         to_char((cr."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS "day",
         CASE
           WHEN cr."questionsJson" -> 0 -> 'microTest' -> 'situation' IS NOT NULL
             AND jsonb_typeof(cr."questionsJson" -> 0 -> 'microTest' -> 'situation') <> 'null' THEN 'THEORY'
           WHEN cr."questionsJson" -> 0 -> 'microTest' ->> 'setting' = 'OFF_COURT' THEN 'OFF_COURT'
           ELSE 'ON_COURT'
         END AS "filter"
  FROM "CalibrationRound" cr
  WHERE cr."action" = 'PROPOSE_MICRO_TEST'
    AND to_char((cr."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD')
        = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD')
    AND NOT EXISTS (SELECT 1 FROM "MicroTestSlot" s WHERE s."roundId" = cr."id")
) r
ON CONFLICT DO NOTHING;
