# PF4 authenticated athlete and calendar

The reference is [PF4](https://www.murru.cloud/demo/pf4/). `/user` is the PF4 Home; `/user/training` is a navigable calendar with session details at `/user/training/sessions/:id`. `/user/performance` shares the baseline Performance Result visual component. `/user/check-in` presents one question at a time; `/user/profile` exposes the existing coach relationship. Mobile and desktop keep the same hierarchy, Public Sans, white/black/lime, rounded cards, thin dividers and calendar status rings.

## Discovery and entry

Public discovery returns `sportContext.mode = fixed` by default, resolving active `PADEL` / `STANDARD` catalog keys on the server. `PF4_SPORT_KEY` and `PF4_SPECIALIZATION_KEY` can select configured catalog keys; no React IDs are hardcoded. Missing/disabled context fails with 503. Fixed sport/specialization templates do not appear among visible questions or count toward progress. Other questions retain their configuration.

Registration, including Google, persists the server-resolved IDs even if the client omits or forges them. The immutable configuration includes the context and contributes to its version. Legacy saved configurations remain readable. Set `PF4_SPORT_MODE=user_choice` to restore configured selectors and their normal validation using the same contract.

Saving duration shows “Programma confermato” with “Vai al programma” leading to `/user`. Login and the public entry route completed journeys to Home. A duration confirmation does not claim a plan has already been published: Home shows preparation until an active published release exists and refreshes every 30 seconds while preparing.

## Persistence and deployment

Apply `20260919120000_training_sessions` before deploying the API using the normal migration deployment procedure:

```sh
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:generate
```

`TrainingSession` has foreign keys to the athlete, release and source item, a unique `(trainingPlanReleaseId, trainingPlanItemId)` key, and indexes on athlete/date and release/date. `TrainingPlanItem.orderIndex` records generator array order without changing any generated content or prompt.

The migration backfills actual published releases, copying existing completion data. It recovers item order from `outputJson.planItems` where title/body match; old edited/unmatched or identical items have deterministic ID tie-breaking because their original order was not stored. No extra content is fabricated for the chosen program duration.

Publication creates one occurrence per item in the same transaction. Fallback day offsets are `floor(index * 7 / itemCount)` from the publication date. This preserves order, supports several items on one date, and never expands beyond the current seven-day cycle. Optional `metadata.schedule.dayOffset` integers from 0 through 6 take precedence. Publication retries use a transaction lock plus a unique constraint and `createMany(skipDuplicates)`; they preserve previously saved dates and outcomes.

Calendar date semantics use **Europe/Rome** everywhere. `scheduledDate` is a PostgreSQL `DATE`, exchanged as `YYYY-MM-DD`, avoiding UTC/browser timezone shifts. Completion timestamps remain instants. A streak counts distinct consecutive Italian dates on which sessions were actually completed, starting today or yesterday.

## Athlete API

All routes require the existing authenticated guard, current consents and USER role; IDs are scoped to the current athlete. Dates are inclusive, validated, and limited to 93 days per calendar request.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/athlete/home` | Performance, duration, primary action, next session, due check-in, week, real completion counts/streak and coach names |
| GET | `/athlete/progress` | Current snapshot and latest 100 history entries, with aggregated potential and drivers |
| GET | `/athlete/check-in` | Earliest due training check-in, otherwise relevant area check-in; no score/answer internals |
| GET | `/athlete/training/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Bounded calendar occurrences with presentation state |
| GET | `/athlete/training/sessions/:id` | Session instructions, selected real metadata, completion and action availability |
| POST | `/athlete/training/sessions/:id/complete` | Atomic session/source-item completion |
| POST | `/athlete/training/sessions/:id/skip` | Atomic session/source-item skip |

Completion reuses the existing optional `completionNotes` (max 5000 characters) and **1–5** integer `completionRating` contract. Repeating the same terminal action is safe; conflicting terminal actions return 409. The legacy source-item completion endpoint also synchronizes its persisted occurrence.

Only `SCHEDULED`, `COMPLETED`, `SKIPPED` are stored. Presentation maps completed to **Fatto**, skipped to **Saltato**, today to **Oggi**, future to **In programma**, and overdue scheduled to **Non svolto**. Missed sessions remain scheduled and never silently count as skipped or finished. Archived releases remain readable but cannot be acted upon.

Home chooses today's incomplete session, then a due check-in, then the next future session, then preparation if no active published plan exists, otherwise no current action. It never generates workouts. Displayed metadata is limited to stored duration, equipment, sets, repetitions and recovery; AI provider/prompt metadata is not exposed.

## Check-in and scoring boundaries

Training check-ins become due only after every source activity is completed or skipped. `/answers/training/batch` validates this condition, claims the published questionnaire transactionally and stores the existing option answers; concurrent submissions cannot create duplicate answers. The next training generation is gated on both terminal activities and a closed questionnaire. Existing generation triggers and coach approvals are retained.

The existing training-answer path records and closes the questionnaire; it does **not** calculate a new performance snapshot. This slice does not invent a score change. Area answers continue through the existing snapshot/scoring pipeline. Returning to Home or Progress fetches current stored performance; a completed workout alone does not award points or raise the index.

## Validation

- Unit tests cover calendar dates/DST, bounded ranges, deterministic distribution, metadata overrides, missed versus skipped, streaks and fixed-context tampering.
- PostgreSQL 16 integration covers real migrations, authenticated API access, athlete isolation, concurrent publication/action attempts, atomic session/item updates, rollback, check-in readiness and next-cycle gating; discovery/Google integration also verifies server-resolved context.
- Frontend tests cover preparation, session action, bounded month navigation, optional completion feedback, question-by-question submission and shared performance visuals.
- Browser review uses explicit test fixtures, with mobile (390px) and desktop (1440px) screenshots; it is separate from the database-backed API tests.

Validation completed with Node 26.8.2 and pnpm 10.28.2: `pnpm lint`, `pnpm typecheck`, `pnpm test` (85 API unit, 68 API e2e, 53 web), `pnpm build`, and PostgreSQL 16 `pnpm --filter api test:db` (28 tests). Docker was unavailable locally; the DB suite ran against a dedicated standalone PostgreSQL 16.14 instance on port 55432. The two existing lint warnings remain. Chrome reviewed six screens at both widths, plus feedback and preparation states, without horizontal overflow or JavaScript errors.
