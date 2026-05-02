-- Rename ProfessionalClientLink to ProfessionalUserLink
ALTER TABLE "ProfessionalClientLink" RENAME TO "ProfessionalUserLink";

-- Rename column clientId -> userId
ALTER TABLE "ProfessionalUserLink" RENAME COLUMN "clientId" TO "userId";

-- Rename constraints
ALTER TABLE "ProfessionalUserLink" RENAME CONSTRAINT "ProfessionalClientLink_pkey" TO "ProfessionalUserLink_pkey";
ALTER TABLE "ProfessionalUserLink" RENAME CONSTRAINT "ProfessionalClientLink_professionalId_fkey" TO "ProfessionalUserLink_professionalId_fkey";
ALTER TABLE "ProfessionalUserLink" RENAME CONSTRAINT "ProfessionalClientLink_clientId_fkey" TO "ProfessionalUserLink_userId_fkey";

-- Rename unique index
ALTER INDEX "ProfessionalClientLink_professionalId_clientId_key" RENAME TO "ProfessionalUserLink_professionalId_userId_key";
