-- Scenari P3/P6/P12 e lezione gratuita fanno parte del flusso pre-paywall:
-- un database nuovo li ha accesi per tutti. I flag già salvati restano come
-- li ha lasciati il back office.
INSERT INTO "FeatureFlag" ("key", "description", "enabled", "betaTesters", "rolloutPercent", "updatedAt")
VALUES
  ('potential_scenarios', 'A calibrazione chiusa mostra P3/P6/P12 e la scelta del percorso di 3, 6 o 12 mesi (1.8-1.9).', true, true, 100, CURRENT_TIMESTAMP),
  ('free_lesson', 'Lezione gratuita al circolo con crediti di interazione e micro-test durante la calibrazione (A4.8, A7.2).', true, true, 100, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
