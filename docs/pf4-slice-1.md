# PF4 Slice 1 — Discovery → registration → authenticated journey

## Run

Use Node from `.nvmrc`, then `pnpm install`, `pnpm --filter api prisma:generate`.
`pnpm docker:up` starts PostgreSQL, Redis, migrations, API and frontend. Open `/start`.
For an existing deployment, apply `pnpm --filter api prisma:migrate:deploy` before starting the new API.
The two new migrations add the `DISCOVERY` template scope, the discovery snapshot table, and seven initial question templates. Sport and specialization choices reuse the existing active domain records.

`/register` now redirects to `/start`. Password registration through `POST /api/auth/register-athlete` **requires discovery** and creates an active athlete immediately. Existing pending/rejected accounts are not silently activated or overwritten. Google registration is outside this slice and retains its existing flow.

## Public configuration and editing

`GET /api/public/athlete-discovery` returns `version`, public `sports` with specializations, and ordered active `questions`. It performs only reads, exposes no training prompts, and sends `Cache-Control: no-store`.

Questions reuse `OnboardingQuestionTemplate`. Edit them with the existing authenticated AI_TUNER API: `POST /api/ai-tuning/onboarding-templates`. Use an existing `id` to update, omit it to create. Set `scope: DISCOVERY`, `label`, `helpText`, `required`, `orderIndex`, `isActive` and `optionsJson`. General and area onboarding remain separate.

Example `optionsJson` for a configurable question:

```json
{
  "type": "multi_choice",
  "options": [
    { "id": "technique", "label": "Tecnica", "description": "Controllo del gesto", "value": "technique" },
    { "id": "endurance", "label": "Resistenza", "value": "endurance" }
  ],
  "ui": { "presentation": "cards", "columns": 2 }
}
```

Supported types: `single_choice`, `multi_choice`, `number`, `scale`, `boolean`.
For numeric controls provide finite `min < max` and optional positive `step` (default 1); `ui.unit` is optional. A boolean question needs two options with values `true` and `false`. Selection answers use option **IDs**, numeric answers use numbers, booleans use booleans.
`inputType` remains the existing Prisma enum: use `SELECT`, `NUMBER`, or `SCORE`; discovery rendering uses `optionsJson.type`.

Three required single-choice templates have `target: sportId`, `specializationId`, or `goalId`. Keep exactly one of each active. Sport and specialization options are filled from active domain records; specialization options include their parent sport ID. Goal options are configured in the goal template and the selected label initializes `UserPerformanceGoal.goalText`; no AI validation/freeze is claimed. Configure sport before specialization. No additional goal catalog existed to reuse.

The numeric configuration version is a deterministic SHA-256 prefix of the public questions and choices. Labels, options, ordering, enabled state and domain changes therefore invalidate old versions automatically. Registration rejects stale drafts; reload starts a draft using the current configuration. Public requests never repair or seed missing configuration.

## Registration and journey ownership

Request fields: `firstName`, `lastName`, `email`, `password`, `discovery`.
Discovery contains `version`, `currentStep: registration`, `sportId`, `specializationId`, `goalId`, `answers`.
Every required answer, question ID, option ID, number boundary/step and sport-specialization relationship is checked against configuration read inside the registration transaction. Unknown answers and stale configuration are rejected. Duplicate email registration does not alter an existing account.

A serializable transaction creates the active athlete, pending assessment, sport selection, goal and a discovery snapshot including the exact configuration. The session ID is regenerated and explicitly saved before success. The HTTP-only session cookie uses the application's existing cookie settings. No password or discovery details are returned in the registration response.

Response:

```json
{
  "user": { "id": "…", "isActive": true },
  "journey": { "phase": "CONSENTS", "nextStep": "CONSENTS" }
}
```

`GET /api/auth/journey` requires authentication. The backend returns `CONSENTS` until current required consents are satisfied, then `ASSESSMENT`. The consent exemption for this endpoint only permits reading the next step; other protected operations retain their consent checks. `/journey` reloads this backend state instead of trusting query parameters or sessionStorage. The destination is a minimal authenticated confirmation, as requested; consent editing and the full assessment are not implemented in this slice.

The browser clears the discovery draft after registration; it never persists registration passwords. Before registration, sessionStorage restores the exact current step and answers. Changing sport clears its dependent specialization. Single-choice and boolean controls advance after 240 ms, as in the demo; multi-choice and numeric controls have a Continue CTA.

## Visual reference

Source: https://www.murru.cloud/demo/pf4/ (inspected in Chromium at desktop and mobile sizes).
Reproduced Public Sans (bundled locally with OFL license), lightweight headings, thin divided options, lime selection, segmented progress, 12 px buttons, 18 px lime result card and screen transition. At 900 px and above, the desktop layout expands to a maximum 1320 px with a brand column and a spacious assessment column; it does not simulate a phone. Below 900 px the flow fills the viewport with 24 px gutters. This responsive desktop treatment follows the user’s explicit refinement of the reference. Browser UI/status icons are not simulated.

Scope-driven differences: explicit intro and required sport/specialization sequence; separate first/last name fields for the existing identity model; result content summarizes the selected profile/goal without claiming a free trial, generated program, BMI, forecast, or official Performance Index. Health measurements and injury questions are not part of the initial seven-question configuration. The five renderer types remain available for backend configuration.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm test:docker` runs PostgreSQL 16 integration tests in isolation, including migrated discovery configuration, invalid/stale requests, active registration, HTTP-only session, cookie-only continuation and duplicate email rejection.
- Native local fallback: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/performancefactory_refactor_test pnpm --filter api test:db` (local PostgreSQL 18; Docker 16 remains the CI gate).
- Vitest covers all five renderer types, dynamic question count, draft restoration, dependent selection reset, automatic advancement cancellation and the result→registration transition.
- Manual Chromium run completed `/start`→refresh→result→registration→authenticated `/journey`, verified HTTP-only cookie, no browser exceptions and no horizontal overflow at 390 px.
- Existing CI automatically runs unit/frontend tests, API e2e, PostgreSQL container integration, lint/types, production builds and full Docker-stack checks on each PR and push.

Limitations: the authenticated destination intentionally stops before implementing the next slice. Configuration UI remains the existing AI_TUNER API; no new admin editor is introduced. If the session store fails after the database transaction commits, the account exists and the user can recover through login; the transaction cannot atomically commit to PostgreSQL and the external session store.
