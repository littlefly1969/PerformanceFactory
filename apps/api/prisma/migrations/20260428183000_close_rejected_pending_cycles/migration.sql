WITH rejected_plan_releases AS (
  SELECT DISTINCT plan.id
  FROM "ImprovementPlanRelease" plan
  LEFT JOIN "PlanItem" item
    ON item."planReleaseId" = plan.id
    AND item.status = 'REJECTED'
  LEFT JOIN "QuestionSet" question_set
    ON question_set."planReleaseId" = plan.id
  LEFT JOIN "QuestionSetAreaApproval" approval
    ON approval."questionSetId" = question_set.id
    AND approval.status = 'REJECTED'
  WHERE plan.status = 'PENDING_APPROVAL'
    AND (item.id IS NOT NULL OR approval.id IS NOT NULL)
)
UPDATE "ImprovementPlanRelease" plan
SET
  status = 'REJECTED',
  "cycleStatus" = 'CLOSED'::"CycleStatus"
FROM rejected_plan_releases rejected
WHERE plan.id = rejected.id;

WITH rejected_plan_releases AS (
  SELECT id
  FROM "ImprovementPlanRelease"
  WHERE status = 'REJECTED'
    AND "cycleStatus" = 'CLOSED'::"CycleStatus"
)
UPDATE "QuestionSet" question_set
SET status = 'REJECTED'
FROM rejected_plan_releases rejected
WHERE question_set."planReleaseId" = rejected.id
  AND question_set.status = 'PENDING_APPROVAL';

WITH rejected_plan_releases AS (
  SELECT id
  FROM "ImprovementPlanRelease"
  WHERE status = 'REJECTED'
    AND "cycleStatus" = 'CLOSED'::"CycleStatus"
)
UPDATE "PlanItem" item
SET
  status = 'REJECTED',
  "rejectedAt" = COALESCE(item."rejectedAt", NOW()),
  "rejectionReason" = COALESCE(item."rejectionReason", 'Cycle rejected')
FROM rejected_plan_releases rejected
WHERE item."planReleaseId" = rejected.id
  AND item.status = 'PROPOSED';

WITH rejected_plan_releases AS (
  SELECT id
  FROM "ImprovementPlanRelease"
  WHERE status = 'REJECTED'
    AND "cycleStatus" = 'CLOSED'::"CycleStatus"
)
UPDATE "QuestionSetAreaApproval" approval
SET
  status = 'REJECTED',
  "rejectedAt" = COALESCE(approval."rejectedAt", NOW()),
  "rejectionReason" = COALESCE(approval."rejectionReason", 'Cycle rejected')
FROM "QuestionSet" question_set
JOIN rejected_plan_releases rejected
  ON rejected.id = question_set."planReleaseId"
WHERE approval."questionSetId" = question_set.id
  AND approval.status = 'PENDING';

WITH rejected_plan_releases AS (
  SELECT id
  FROM "ImprovementPlanRelease"
  WHERE status = 'REJECTED'
    AND "cycleStatus" = 'CLOSED'::"CycleStatus"
)
UPDATE "AiContextSummary" summary
SET "cycleStatus" = 'CLOSED'::"CycleStatus"
FROM rejected_plan_releases rejected
WHERE summary."planReleaseId" = rejected.id;
