-- Logo e foto dei circoli per il carosello del regalo (lezione di prova gratuita).
ALTER TABLE "Partner" ADD COLUMN "logoImage" TEXT;
ALTER TABLE "Partner" ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "photoImage" TEXT;
ALTER TABLE "Partner" ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);
