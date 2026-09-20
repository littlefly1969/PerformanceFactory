# PF4 — complete onboarding journey

Extends Slice 1 on `/start` and `/journey`. The demo at https://www.murru.cloud/demo/pf4/ supplies the sequence, content and PF4 style. Desktop retains the wide responsive layout requested by the owner. Visual acceptance remains with the owner; automated checks cover behavior and contracts.

## Public configuration and context

The active `DISCOVERY` templates now include age range, limitations, event date (optional), weight and height, alongside motivation, experience, frequency, goal and event. The authenticated-athlete slice fixes the public sport context to server-resolved Padel/Standard and hides the two selectors. `optionsJson.type` supports `date` as well as existing controls. `contextKey` associates a configured answer with its profile field; it never requires React branches by question ID. BMI is calculated from declared measurements and is explicitly preliminary, separate from the official index. Public answers stay in sessionStorage until registration.

Registration saves an immutable configuration snapshot. The onboarding service converts this snapshot and its validated answers into the general profile, including option values and physical/anamnesis fields. These are reused for generation and final goal validation, without asking the general questions again. Existing non-PF4 onboarding continues to use the active GENERAL templates.

## Assessment and state

`GET /auth/journey` is the authenticated source of truth. It returns CONSENTS, ASSESSMENT_INTRO, ASSESSMENT, PROCESSING, RESULT, DURATION or COMPLETE. Answer values, current question, processing lease, baseline ID and program duration live in PostgreSQL (`AthleteDiscovery`). Anonymous drafts do not drive authenticated progress.

Authenticated mutations require the existing bearer/session authentication guard and current required consents:

- `POST /athlete-journey/start`: copies configured specialist questions into `UserOnboardingQuestion`, or uses the existing AI specialist generator when no sport-specific configuration exists.
- `POST /athlete-journey/answer`: validates option membership, persists the answer and advances the server cursor.
- `POST /athlete-journey/back`: persists the preceding cursor.
- `POST /athlete-journey/submit`: validates the final goal through the existing provider, then invokes onboarding submit. A rejected goal requires revision; it is not silently bypassed.
- `POST /athlete-journey/duration`: opens duration selection, or persists 4, 12 or 52 weeks.

The migration supplies 12 Padel AREA templates, two for each existing domain area. Their `optionsJson` has `sportKey: "PADEL"` and an `options` array with value/label/score. Admin template editing can change text, options, order, activation and count. Each athlete gets a stable copy when beginning. Other sports keep the existing AI question generator. The UI derives count, progress and estimated time from the server. No fixed twelve-question React flow exists.

Submission uses the existing backend scoring and creates a real `PerformanceProfileSnapshot` and `CurrentState`. The result's current, potential, gap and driver scores are derived on the server from that snapshot. The existing baseline potential model (current plus 15, capped at 100) remains in place; the frontend does not invent scores or duration-specific predictions. Repeated submissions return the same baseline. Concurrent processing is leased and baseline creation is protected by a PostgreSQL advisory transaction lock.

Submission claims the same advisory lock used by answer writes before reading the answers under its processing lease. This prevents a concurrent final edit from being omitted from the submitted baseline. Failed validation releases the lease; expired leases allow editing and retrying again. Repeated starts preserve questions and cursor even when another start finishes between the initial check and the lease claim.

Duration is also stored as `program_duration_weeks` in `UserOnboardingAssessment.profileJson`, which the existing AI cycle/training generation consumes. The authenticated continuation is documented in [PF4 athlete and calendar](pf4-athlete-calendar.md): saved duration now leads to the PF4 Home through the final CTA.

## Email and Google

Both use the same domain-creation service. Email creates an active user/session followed by required consents. Google retains the existing OIDC state, nonce, PKCE and JWT validation. After verification, `/journey?google=complete` displays current consent documents and submits the browser draft with explicit consent acceptance. User, AuthIdentity, discovery, sport, goal, pending assessment and consents are created atomically, followed by session regeneration. It no longer returns PENDING_ADMIN_ACTIVATION for a new athlete. Existing Google login still works; existing disabled accounts are not automatically reactivated.

Local login and public entry resume unfinished PF4 journeys at `/journey` and completed journeys at `/user`. The old `/register/google/consents` route redirects to the PF4 continuation.

## Validation

- PostgreSQL integration covers migrations, configuration, invalid/stale drafts, registration, consent gates, configured questions, answer/cursor persistence, baseline scores and idempotency, duration handoff and Google registration/login.
- Google integration replaces only external token/JWKS transport with test RSA-signed tokens; real Google account interaction is not automated.
- Frontend functional tests cover dynamic questions, server-owned continuation, result values, duration persistence and discovery handoff after Google redirect.
- No screenshot or visual comparison tests are performed.

### Resume validation

Validated with Node 26.8.2 and pnpm 10.28.2. Frontend tests pass with `pnpm --filter web test --maxWorkers=1` (47 tests); API unit tests pass with `pnpm --filter api exec jest --runInBand` (71 tests), and `pnpm --filter api test:e2e` passes (68 tests). The parallel root test run encountered worker startup timeouts under host memory pressure, so the suites were rerun with reduced concurrency.

`TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/performancefactory_resume_test pnpm --filter api test:db` passes all 20 integration tests, including stale submission reads, competing starts and lease recovery. This fallback uses a dedicated local PostgreSQL 18 database. The preferred PostgreSQL 16 `pnpm test:docker` run could not start because the Docker socket denied access; PostgreSQL 16 verification remains outstanding. Live Google account interaction and visual acceptance remain manual.

`pnpm build`, `pnpm typecheck`, `pnpm check:size` and `git diff --check` pass. Repository lint passes with two warnings (an existing onboarding React effect and the Google test transport's async mock); the changed journey service and integration tests also pass a final targeted ESLint check after formatting.
