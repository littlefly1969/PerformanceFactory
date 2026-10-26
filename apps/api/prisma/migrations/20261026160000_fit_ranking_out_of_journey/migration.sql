-- La classifica FIT esce dal percorso: le cinque domande `fit:*` stavano
-- subito dopo le due operative. Il cursore dei percorsi che le contenevano si
-- riallinea alla nuova sequenza (2 operative, poi le domande dei driver) e le
-- risposte `fit:*` si tolgono: la classifica vive in `AthleteFitRanking`.
UPDATE "AthleteDiscovery"
SET
  "currentQuestion" = CASE
    WHEN "currentQuestion" > 7 THEN "currentQuestion" - 5
    WHEN "currentQuestion" > 2 THEN 2
    ELSE "currentQuestion"
  END,
  "assessmentAnswers" = "assessmentAnswers"
    - 'fit:padelCurrent'
    - 'fit:padelBest'
    - 'fit:tennisCurrent'
    - 'fit:tennisBest'
    - 'fit:cardNumber'
WHERE "assessmentAnswers" ?| ARRAY[
  'fit:padelCurrent',
  'fit:padelBest',
  'fit:tennisCurrent',
  'fit:tennisBest',
  'fit:cardNumber'
];
