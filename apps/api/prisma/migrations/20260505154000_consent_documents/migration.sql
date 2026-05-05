-- CreateTable
CREATE TABLE "ConsentDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentDocument_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN "documentBody" JSONB;
ALTER TABLE "Consent" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ConsentDocument_type_version_key" ON "ConsentDocument"("type", "version");

-- CreateIndex
CREATE INDEX "ConsentDocument_type_isActive_idx" ON "ConsentDocument"("type", "isActive");

-- AddForeignKey
ALTER TABLE "ConsentDocument" ADD CONSTRAINT "ConsentDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
