-- Archivio video di approfondimento (back office) e preferenza di giorno e orario per la lezione gratuita.
CREATE TABLE "CoachingVideo" (
    "id" TEXT NOT NULL,
    "areaId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoachingVideo_areaId_isActive_idx" ON "CoachingVideo"("areaId", "isActive");

ALTER TABLE "CoachingVideo" ADD CONSTRAINT "CoachingVideo_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FreeLessonSeat" ADD COLUMN "preferredLessonId" TEXT;

ALTER TABLE "FreeLessonSeat" ADD CONSTRAINT "FreeLessonSeat_preferredLessonId_fkey" FOREIGN KEY ("preferredLessonId") REFERENCES "FreeLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
