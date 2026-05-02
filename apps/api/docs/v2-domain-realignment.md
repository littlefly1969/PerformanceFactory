# PerformanceFactory V2+ Domain Realignment

## Scope
This document captures the V2+ domain realignment for PerformanceFactory:
- Performance Profile (R/P) across 6 areas
- Global ranking (0-100)
- Plan releases with versioning
- AI-governed question cycles
- Full historical traceability
- Privacy-by-design (no sensitive leakage)
- Postgres + Prisma as canonical source

## New Canonical Models
- `PerformanceProfileSnapshot`
- `PerformanceProfileSnapshotArea`
- `ImprovementPlanRelease`
- `PlanItem`
- `QuestionSet`
- `Question`
- `AnswerOption`
- `UserAnswer`
- `AiContextSummary`
- `PerformanceScaleConfig`

Legacy V1 models `GuidanceContent` and `UserAssignment` are marked as deprecated and must not be used for new flows.

## New API Routes
- `GET /api/performance/profile/current`
- `GET /api/performance/profile/history`
- `GET /api/plans/current`
- `GET /api/plans/history`
- `GET /api/questions/current`
- `POST /api/questions/:setId/close`
- `POST /api/answers/batch`
- `GET /api/questions/approvals/pending`
- `POST /api/questions/:setId/areas/:areaId/approve`
- `POST /api/questions/:setId/areas/:areaId/reject`
- `PATCH /api/questions/:setId/questions/:questionId`
- `PATCH /api/questions/questions/:questionId/options/:optionId`
- `GET /api/plans/approvals/pending`
- `POST /api/plans/items/:itemId/approve`
- `POST /api/plans/items/:itemId/reject`
- `POST /api/admin/orchestrator/run`
- `POST /api/admin/cycles/:cycleId/publish`
- `GET /api/professional/approvals`
- `POST /api/professional/questionsets/:id/approve`
- `POST /api/professional/questionsets/:id/reject`
- `POST /api/professional/plan-items/:id/approve`
- `POST /api/professional/plan-items/:id/reject`
- `GET /api/cycles/:cycleId/status`
- `GET /api/user/plan/current`
- `POST /api/user/plan-items/:id/complete`
- `GET /api/user/questions/current`
- `GET /api/inspect/cycles`
- `GET /api/inspect/cycles/:cycleId`
- `GET /api/inspect/users`
- `GET /api/inspect/users/:userId`
- `GET /api/inspect/professionals`
- `GET /api/inspect/professionals/:id`
- `POST /api/inspect/users`
- `POST /api/inspect/links`
- `POST /api/inspect/competences`

Note: "SYSTEM" access is out of scope and not implemented as a UserRole.
Admin endpoints are restricted to `ADMIN` only.

## Orchestrator Behavior (Stub)
`OrchestratorService.runCycle()` performs a deterministic **proposal** cycle:
1. Loads the active `PerformanceScaleConfig` (fallback defaults if none).
2. Creates a new `ImprovementPlanRelease` in `PENDING_APPROVAL`.
3. Creates `PlanItem` entries in `PROPOSED`.
4. Creates a `QuestionSet` in `PENDING_APPROVAL` and corresponding area approvals.
5. Emits an `AiContextSummary` with cycle metadata.

Publishing is a **separate step** (`publishCycle`) and is allowed only after all approvals are completed.

### Human-in-the-Loop Gating
No question set or plan item is visible to the user unless:
- All area approvals are `APPROVED`
- All plan items are `APPROVED`
- The system publishes the cycle

### Close Cycle
`createSnapshotFromQuestionSet` is called when a **PUBLISHED** question set is closed.
It calculates R/P with the configured scale, creates a new `PerformanceProfileSnapshot`,
then transitions the question set to `CLOSED`.
Closure is rejected if any question is unanswered.

## Performance Scale Configuration
Scale values are configurable via `PerformanceScaleConfig`:
- `minScore` (default 0)
- `maxScore` (default 100)
- `potentialStep` (default 5)
- `thresholdRatio` (default 0.85)
- `isActive` (default true)

Only one row may be active. The orchestrator uses the latest active row by `createdAt`.

Global ranking remains normalized to 0-100 even if `maxScore` changes:
```
rankingGlobal = round(((avgReal - minScore) / (maxScore - minScore)) * 100)
```

## Data Integrity: Single ACTIVE Plan
We enforce single ACTIVE plan per user in two layers:
- Application layer: orchestrator archives existing ACTIVE plans before creating a new one.
- Database layer: a partial unique index on `ImprovementPlanRelease(userId)` where `status = 'ACTIVE'`.

This protects against concurrent writers and manual inserts.

## Migration Notes
This repo includes a manual migration at:
`apps/api/prisma/migrations/20260207000000_v2_domain_realignment/migration.sql`

It adds all V2+ tables and constraints plus:
- Partial unique index for single ACTIVE plan per user.
- Partial unique index for a single active scale config.
- Optional FK from `UserAnswer.answerOptionId` to `AnswerOption.id`.
- New tables for HITL approvals and professional competences.

Additional hardening migration:
`apps/api/prisma/migrations/20260207000100_admin_cycle_hardening/migration.sql`
adds cycle status fields and audit logs for admin cycle control.

Professional workspace migration:
`apps/api/prisma/migrations/20260207000200_professional_workspace/migration.sql`
adds approval audit fields and FK for professional actions.

User plan completion migration:
`apps/api/prisma/migrations/20260207000300_user_plan_completion/migration.sql`
adds completion metadata for `PlanItem` (`completedAt`, `completionNotes`, `completionRating`).

Because this sandbox cannot access Neon, apply this migration in an environment with DB access.

## Example Scale Seed
Use a single active scale config:
```
INSERT INTO "PerformanceScaleConfig"
  ("id", "minScore", "maxScore", "potentialStep", "thresholdRatio", "isActive")
VALUES
  (gen_random_uuid(), 0, 100, 5, 0.85, true);
```

## Tests
New integration tests cover:
- New cycle archives the previous plan and preserves a single ACTIVE plan.
- Answer submission creates `UserAnswer` rows.
- ABAC enforcement for professional access.
- Password redaction is still enforced (existing tests).
## Cycle Status
Explicit lifecycle status is stored in:
- `ImprovementPlanRelease.cycleStatus`
- `AiContextSummary.cycleStatus`

Allowed values:
`PROPOSED`, `WAITING_APPROVALS`, `READY_TO_PUBLISH`, `PUBLISHED`, `CLOSED`.

Transitions:
- Proposal run → `WAITING_APPROVALS`
- All approvals completed → `READY_TO_PUBLISH`
- Publish → `PUBLISHED`
- Close question set → `CLOSED`

## Professional Approval Workspace
Professional inbox and approval endpoints are scoped by:
- linked users (ProfessionalUserLink)
- area competence (ProfessionalAreaCompetence)

Approvals are explicit and audit fields are captured:
- `approvedByProfessionalId`
- `approvedAt`
- `rejectedAt`
- `rejectionReason`

Entities in `APPROVED` or `PUBLISHED` are immutable.
