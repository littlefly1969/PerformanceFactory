-- Provenienza dell'indirizzo dell'atleta. Gli indirizzi esistenti restano MANUAL e senza verifica:
-- la verifica si chiede solo alla prossima modifica, scegliendo un suggerimento riconosciuto.
CREATE TYPE "AddressSource" AS ENUM ('MANUAL', 'GOOGLE_PLACES');

ALTER TABLE "UserAddress"
  ADD COLUMN "source" "AddressSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "placeId" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);
