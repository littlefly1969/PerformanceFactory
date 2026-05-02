ALTER TABLE "ProfessionalUserLink"
  ADD COLUMN IF NOT EXISTS "areaId" TEXT;

UPDATE "ProfessionalUserLink" link
SET "areaId" = area_pick."areaId"
FROM (
  SELECT
    link_inner.id AS "linkId",
    COALESCE(
      (
        SELECT competence."areaId"
        FROM "ProfessionalAreaCompetence" competence
        WHERE competence."professionalId" = link_inner."professionalId"
        ORDER BY competence."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT area.id
        FROM "Area" area
        ORDER BY area.name ASC
        LIMIT 1
      )
    ) AS "areaId"
  FROM "ProfessionalUserLink" link_inner
) area_pick
WHERE link.id = area_pick."linkId"
  AND link."areaId" IS NULL;

DELETE FROM "ProfessionalUserLink" link
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "areaId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS row_number
  FROM "ProfessionalUserLink"
) ranked
WHERE link.id = ranked.id
  AND ranked.row_number > 1;

DROP INDEX IF EXISTS "ProfessionalUserLink_professionalId_userId_key";

ALTER TABLE "ProfessionalUserLink"
  ALTER COLUMN "areaId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProfessionalUserLink_areaId_fkey'
  ) THEN
    ALTER TABLE "ProfessionalUserLink"
      ADD CONSTRAINT "ProfessionalUserLink_areaId_fkey"
      FOREIGN KEY ("areaId") REFERENCES "Area"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalUserLink_userId_areaId_key"
  ON "ProfessionalUserLink"("userId", "areaId");

CREATE INDEX IF NOT EXISTS "ProfessionalUserLink_professionalId_areaId_idx"
  ON "ProfessionalUserLink"("professionalId", "areaId");
