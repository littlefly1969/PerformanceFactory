-- Place ID Google della sede del circolo. I circoli esistenti restano con le coordinate Nominatim
-- finché il rinnovo giornaliero non trova la sede su Google.
ALTER TABLE "Partner" ADD COLUMN "placeId" TEXT;
