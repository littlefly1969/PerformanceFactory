-- Prezzo per combinazione orizzonte x cadenza: il vantaggio degli orizzonti
-- piu lunghi vive qui, non nel listino della cadenza (A5-D01).
ALTER TABLE "ProgramBillingOption" ADD COLUMN "amountCents" INTEGER;
ALTER TABLE "ProgramBillingOption" ADD COLUMN "currency" TEXT;

-- Listino di riferimento senza sconto: 10,00 EUR al mese.
INSERT INTO "BillingCyclePrice" ("billingCycle","amountCents","currency","updatedAt") VALUES
  ('MONTHLY',1000,'eur',CURRENT_TIMESTAMP),
  ('QUARTERLY',3000,'eur',CURRENT_TIMESTAMP),
  ('SEMIANNUAL',6000,'eur',CURRENT_TIMESTAMP),
  ('ANNUAL',12000,'eur',CURRENT_TIMESTAMP)
ON CONFLICT ("billingCycle") DO UPDATE
SET "amountCents" = EXCLUDED."amountCents",
    "currency" = EXCLUDED."currency",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Matrice offerta: 3 mesi a 10,00 EUR/mese, 6 mesi a 9,50 (-5%), 12 mesi a
-- 8,90 (-11%). Lo sconto sta sulla durata del percorso, non sulla cadenza:
-- pagare in un'unica rata non cambia la cifra.
DELETE FROM "ProgramBillingOption";
INSERT INTO "ProgramBillingOption" ("horizon","billingCycle","isActive","amountCents","currency","updatedAt") VALUES
  ('PROGRAM_3M','MONTHLY',true,1000,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_3M','QUARTERLY',true,3000,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_6M','MONTHLY',true,950,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_6M','QUARTERLY',true,2850,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_6M','SEMIANNUAL',true,5700,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_12M','MONTHLY',true,890,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_12M','QUARTERLY',true,2670,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_12M','SEMIANNUAL',true,5340,'eur',CURRENT_TIMESTAMP),
  ('PROGRAM_12M','ANNUAL',true,10680,'eur',CURRENT_TIMESTAMP);

-- Anagrafica del circolo partner: indirizzo, contatti e logo per la scheda
-- mostrata all'atleta e per la lezione gratuita.
ALTER TABLE "Partner" ADD COLUMN "province" TEXT;
ALTER TABLE "Partner" ADD COLUMN "address" TEXT;
ALTER TABLE "Partner" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Partner" ADD COLUMN "website" TEXT;
ALTER TABLE "Partner" ADD COLUMN "logoUrl" TEXT;
