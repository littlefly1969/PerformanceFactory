CREATE TABLE "Sport" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportSpecialization" (
  "id" TEXT NOT NULL,
  "sportId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SportSpecialization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportSpecializationAreaPrompt" (
  "id" TEXT NOT NULL,
  "specializationId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "basePrompt" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "SportSpecializationAreaPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sport_key_key" ON "Sport"("key");
CREATE UNIQUE INDEX "SportSpecialization_sportId_key_key"
  ON "SportSpecialization"("sportId", "key");
CREATE INDEX "SportSpecialization_sportId_isActive_idx"
  ON "SportSpecialization"("sportId", "isActive");
CREATE UNIQUE INDEX "SportSpecializationAreaPrompt_specializationId_areaId_key"
  ON "SportSpecializationAreaPrompt"("specializationId", "areaId");
CREATE INDEX "SportSpecializationAreaPrompt_specializationId_isActive_idx"
  ON "SportSpecializationAreaPrompt"("specializationId", "isActive");
CREATE INDEX "SportSpecializationAreaPrompt_areaId_idx"
  ON "SportSpecializationAreaPrompt"("areaId");

ALTER TABLE "SportSpecialization"
  ADD CONSTRAINT "SportSpecialization_sportId_fkey"
  FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD CONSTRAINT "SportSpecializationAreaPrompt_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD CONSTRAINT "SportSpecializationAreaPrompt_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD CONSTRAINT "SportSpecializationAreaPrompt_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SportSpecializationAreaPrompt"
  ADD CONSTRAINT "SportSpecializationAreaPrompt_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Sport" ("id", "key", "label", "updatedAt") VALUES
  ('sport-cycling', 'CYCLING', 'Ciclismo', CURRENT_TIMESTAMP),
  ('sport-running', 'RUNNING', 'Corsa', CURRENT_TIMESTAMP),
  ('sport-tennis', 'TENNIS', 'Tennis', CURRENT_TIMESTAMP),
  ('sport-padel', 'PADEL', 'Padel', CURRENT_TIMESTAMP),
  ('sport-fitness', 'FITNESS', 'Fitness', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "SportSpecialization" ("id", "sportId", "key", "label", "updatedAt") VALUES
  ('spec-cycling-road', 'sport-cycling', 'ROAD', 'Strada', CURRENT_TIMESTAMP),
  ('spec-cycling-mtb', 'sport-cycling', 'MTB', 'Mountain bike', CURRENT_TIMESTAMP),
  ('spec-running-road', 'sport-running', 'ROAD', 'Strada', CURRENT_TIMESTAMP),
  ('spec-running-track', 'sport-running', 'TRACK', 'Pista', CURRENT_TIMESTAMP),
  ('spec-tennis-standard', 'sport-tennis', 'STANDARD', 'Standard', CURRENT_TIMESTAMP),
  ('spec-padel-standard', 'sport-padel', 'STANDARD', 'Standard', CURRENT_TIMESTAMP),
  ('spec-fitness-home', 'sport-fitness', 'HOME', 'Casa', CURRENT_TIMESTAMP),
  ('spec-fitness-gym', 'sport-fitness', 'GYM', 'Palestra', CURRENT_TIMESTAMP),
  ('spec-fitness-mixed', 'sport-fitness', 'MIXED', 'Misto', CURRENT_TIMESTAMP)
ON CONFLICT ("sportId", "key") DO NOTHING;

INSERT INTO "SportSpecializationAreaPrompt" (
  "id",
  "specializationId",
  "areaId",
  "basePrompt",
  "updatedAt"
)
SELECT
  CONCAT('sport-spec-prompt-', s."id", '-', a."id"),
  s."id",
  a."id",
  CONCAT(
    'Adatta l area ', a."name", ' allo scenario sportivo ',
    sp."label", ' - ', s."label",
    '. Usa questa scelta come vincolo prioritario quando interpreti obiettivo, anamnesi e domande specialistiche. Mantieni il lavoro specifico, pratico, misurabile, progressivo e revisionabile da un professionista.'
  ),
  CURRENT_TIMESTAMP
FROM "SportSpecialization" s
JOIN "Sport" sp ON sp."id" = s."sportId"
CROSS JOIN "Area" a
ON CONFLICT ("specializationId", "areaId") DO NOTHING;

ALTER TABLE "UserSportSelection" DROP COLUMN IF EXISTS "sports";
ALTER TABLE "UserSportSelection" DROP COLUMN IF EXISTS "fitnessLocation";
ALTER TABLE "UserSportSelection"
  ADD COLUMN "sportId" TEXT,
  ADD COLUMN "specializationId" TEXT;

UPDATE "UserSportSelection"
SET "sportId" = 'sport-cycling',
    "specializationId" = 'spec-cycling-road'
WHERE "sportId" IS NULL OR "specializationId" IS NULL;

ALTER TABLE "UserSportSelection"
  ALTER COLUMN "sportId" SET NOT NULL,
  ALTER COLUMN "specializationId" SET NOT NULL;

CREATE INDEX "UserSportSelection_sportId_idx" ON "UserSportSelection"("sportId");
CREATE INDEX "UserSportSelection_specializationId_idx" ON "UserSportSelection"("specializationId");

ALTER TABLE "UserSportSelection"
  ADD CONSTRAINT "UserSportSelection_sportId_fkey"
  FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSportSelection"
  ADD CONSTRAINT "UserSportSelection_specializationId_fkey"
  FOREIGN KEY ("specializationId") REFERENCES "SportSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "AiSportAreaPromptConfig";
