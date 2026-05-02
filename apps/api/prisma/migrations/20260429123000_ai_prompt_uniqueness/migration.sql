WITH duplicate_names AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "name"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS rn
  FROM "AiPromptConfig"
)
UPDATE "AiPromptConfig" prompt
SET "name" = prompt."name" || ' (' || substring(prompt."id" from 1 for 8) || ')'
FROM duplicate_names
WHERE prompt."id" = duplicate_names."id"
  AND duplicate_names.rn > 1;

WITH active_global AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "athleteLevel"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS rn
  FROM "AiPromptConfig"
  WHERE "isActive" = true AND "areaId" IS NULL
)
UPDATE "AiPromptConfig" prompt
SET "isActive" = false
FROM active_global
WHERE prompt."id" = active_global."id"
  AND active_global.rn > 1;

WITH active_area AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "areaId", "athleteLevel"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS rn
  FROM "AiPromptConfig"
  WHERE "isActive" = true AND "areaId" IS NOT NULL
)
UPDATE "AiPromptConfig" prompt
SET "isActive" = false
FROM active_area
WHERE prompt."id" = active_area."id"
  AND active_area.rn > 1;

CREATE UNIQUE INDEX "AiPromptConfig_name_key" ON "AiPromptConfig"("name");

CREATE UNIQUE INDEX "AiPromptConfig_active_global_level_key"
ON "AiPromptConfig"("athleteLevel")
WHERE "isActive" = true AND "areaId" IS NULL;

CREATE UNIQUE INDEX "AiPromptConfig_active_area_level_key"
ON "AiPromptConfig"("areaId", "athleteLevel")
WHERE "isActive" = true AND "areaId" IS NOT NULL;
