-- Asse di conversione (PF-FS-PREPAYWALL §9): ACTIVATED quando R consolidata,
-- P e gap sono stati mostrati; poi la prima apertura del paywall.
ALTER TABLE "AthleteDiscovery" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "AthleteDiscovery" ADD COLUMN "paywallViewedAt" TIMESTAMP(3);
