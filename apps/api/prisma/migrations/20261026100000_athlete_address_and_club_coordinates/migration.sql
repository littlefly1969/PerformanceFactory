-- Indirizzo dell'atleta: serve per dire quanto dista un circolo dalla lezione
-- gratuita. Senza indirizzo la distanza non si calcola e si dice all'atleta.
CREATE TABLE "UserAddress" (
    "userId" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coordinate della sede del circolo, risolte dal suo indirizzo.
ALTER TABLE "Partner" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Partner" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Partner" ADD COLUMN "geocodedAt" TIMESTAMP(3);
