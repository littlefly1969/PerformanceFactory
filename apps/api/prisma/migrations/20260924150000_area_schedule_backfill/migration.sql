-- Il seed non gira nei deploy: senza questo backfill la preparazione atletica
-- resta un elenco senza date anche dove la migrazione area_schedule e applicata.
UPDATE "SportSpecializationAreaPrompt"
SET "isScheduled" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "isScheduled" = false
  AND "areaId" IN (SELECT "id" FROM "Area" WHERE "name" = 'Preparazione atletica');
