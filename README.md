# Yomu

A mobile-first app that teaches South African adults to read and write English **through isiZulu or Sesotho**. Learners who cannot read are guided by voice from the first screen: they choose their language by listening, sign in with a picture and four picture taps, and learn in short lessons on a shared, low-end Android phone, offline when needed. Facilitators at employers, NGOs and adult-education centres can run classes, see what each learner chooses to share, and export completion evidence.

> **Status: working MVP, not yet for real learners.** The app works end to end in both languages, but every isiZulu and Sesotho line is a draft written by the product team and every audio file is a labelled placeholder tone. Native-speaker and educator review, and recording, must come first. See [docs/known-limitations.md](docs/known-limitations.md) and [docs/next-steps.md](docs/next-steps.md).

## What it does

- **Voice-first onboarding:** sound check, spoken language choice, a demonstration, a picture profile and picture secret code, a guest mode that keeps everything on the phone, and spoken consent (POPIA) before anything is stored online. Several learners can share one phone, each behind their own code.
- **Structured curriculum:** 13 lessons from a home-language reading bridge (Level 0) to reading SMSs, signs and a job notice (Levels 4–5), each with full isiZulu and Sesotho pathways; twelve interactive lesson components including tracing, minimal pairs, real-world reading and phone-keyboard typing.
- **Honest progress:** reading mastery needs independent decoding (listening, repeating or recognising never count as reading); forgiving streaks with grace days; XP that never blocks anything; spaced revision weighted towards failed decoding.
- **Tutor in tiers:** Tier 1 (validated recorded clips, offline) for every learner; spoken questions and generated answers are implemented but switched off until a provider is verified for the language in `config/capabilities.json`.
- **Offline first:** lessons, revision and progress work without a connection; an operation log syncs when online and the server recalculates progress from it.
- **Facilitators and organisations:** classes joined by QR code or six-digit code, per-learner sharing choices, assisted mode for forgotten codes and new phones, completion evidence (CSV and PDF, AET mapping marked "proposed, not accredited"), a content review tool and an anonymised pilot export.
- **Privacy by default:** no name, phone number or email needed, no audio stored, self-service export, sharing changes, consent withdrawal and deletion.

## Run it locally

Requirements: Node.js 22+, Docker (for the local Supabase stack) and ffmpeg (the content build generates placeholder audio with it). Nothing here uses paid cloud services.

```bash
npm ci
npx supabase start          # local Postgres, Auth and API in Docker (first run downloads images)
npm run env:local           # writes .env.local with the local Supabase URL and keys
npm run db:seed-content     # copies the curriculum into the database (staff reports, review tool)
npm run db:seed-dev         # local staff accounts, an organisation and a class
npm run build && npm start  # production build at http://localhost:3000
```

- Learner app: <http://localhost:3000>. Use a phone-sized window (or Chrome device emulation); the sound check needs a click to allow audio.
- Staff area: <http://localhost:3000/staff>. `db:seed-dev` prints the accounts (`facilitator@yomu.test`, `admin@yomu.test`, `reviewer@yomu.test`, `platform@yomu.test`, password `yomu-dev-password`) and the class join code. Staff sign-in always needs a second step: at an account's first sign-in, add it to any authenticator app (scan the QR code or type the key shown), then save the recovery codes.
- Developer tutor lab: <http://localhost:3000/dev/tutor> (outside production only).

For development with hot reload, run `npm run content:build` once and then `npm run dev`. The service worker is off in development unless `NEXT_PUBLIC_ENABLE_SW_IN_DEV=true`.

Without Supabase configured, the learner app still runs in guest mode (everything stays on the phone); saving online, classes and facilitator help are not offered.

`npm run env:local`, `db:seed-content` and `db:seed-dev` refuse to touch anything but a local Supabase unless given `--allow-remote`. Do not point them at a production project without authorisation.

## Configuration

Copy `.env.example` to `.env.local` (or use `npm run env:local`). Server-only values never reach the browser.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase API (browser-safe) |
| `SUPABASE_SECRET_KEY` | Server-only key for API routes |
| `PIN_PEPPER` | Server-only secret mixed into secret-code hashes (32+ random characters in production) |
| `CRON_SECRET` | Bearer token for `/api/cron/purge` (retention job) |
| `NEXT_PUBLIC_APP_NAME` | Optional product-name override (default in `src/config/app.ts`) |
| `NEXT_PUBLIC_SHOW_REVIEW_MARKERS` | Show the "unreviewed content" marker (default `true`) |
| `HIDE_UNAPPROVED_CONTENT` | Build only lessons whose every line is approved |
| `AI_STT_PROVIDER`, `AI_LLM_PROVIDER`, `AI_TTS_PROVIDER` | `dev`, `vulavula` / `anthropic`, or `none`. Learners see a capability only if the matrix verifies it |
| `ANTHROPIC_API_KEY`, `AI_LLM_MODEL`, `VULAVULA_API_KEY`, `VULAVULA_COST_PER_MINUTE_USD` | Provider credentials and pricing (model default `claude-opus-5-5`) |
| `AI_DAILY_SPEND_CAP_USD`, `AI_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PER_DAY`, `AI_TIMEOUT_MS`, `AI_MAX_QUESTION_SECONDS` | Cost and abuse controls |
| `TUTOR_LOG_RETENTION_DAYS` | How long tutor question text is kept (default 90) |
| `ANALYTICS_ENABLED`, `NEXT_PUBLIC_ANALYTICS_ENABLED` | Switch usage counts off entirely (server, client) |
| `DEV_TOOLS_ENABLED` | Allow the tutor lab in production (default off) |
| `CAPABILITY_MATRIX_PATH` | Use another capability matrix file (tests and the lab only) |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js development server / production build (runs the content build first) / production server |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript |
| `npm test` | Unit tests (Vitest): learning engine, mastery, sync contract, offline storage, tutor server, capability gate, exports |
| `npm run test:db` | Row-level security and database functions per role, against the local Supabase |
| `npm run test:e2e` | Playwright at 360 × 640: both first-day journeys, shared phone, offline then online, slow 3G, class and facilitator, consent and usage counts, accessibility (axe) |
| `npm run perf:lighthouse` | Lighthouse and the performance budgets against a running production server (`PERF_URL`) |
| `npm run content:validate` | Validates all content; fails on a missing exercise, answer, image, audio reference or language pathway |
| `npm run content:build` | Compiles lessons, packs, the service worker and placeholder audio into `public/` |
| `npm run content:schema` | Regenerates the JSON Schemas in `content/schema/` |
| `npm run content:pull-reviews` | Brings review decisions from the review tool into the content files |
| `npm run audio:manifest` | Recording manifests for voice talent (`content/audio/*.csv`) |
| `npm run audio:import -- --source <dir>` | Imports, trims, normalises and encodes recordings (Opus 16 kbps, AAC 32 kbps) |
| `npm run audio:placeholders` | Regenerates labelled placeholder tones |
| `npm run docs:aet`, `npm run docs:consent` | Regenerate the AET alignment and consent scripts documents |
| `npm run db:seed-content`, `npm run db:seed-dev`, `npm run env:local` | Local database and environment helpers (local only by default) |

Generated files have a `-- --check` mode used by CI (`content:schema`, `docs:aet`, `docs:consent`, `audio:manifest`).

## How it is built

- **Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase** (Postgres, Auth, row-level security). A Progressive Web App with a service worker.
- **Learner app** (`src/learner/`): one client-side, hash-routed app so every screen works offline. Screens beyond the first are loaded on demand and prefetched in idle time. Progress lives in IndexedDB as an operation log; `src/lib/learning/` derives mastery, XP, streaks, revision and the path from it with pure functions that the server runs too ([docs/learning-engine.md](docs/learning-engine.md)).
- **Server** (`src/app/api/`, `src/server/`): route handlers authenticate the caller, validate input with zod and use the service role only after authorising. Sync stores operations idempotently and recalculates progress. Staff pages (`/staff`) query through row-level security and consent-checking database functions.
- **Database** (`supabase/migrations/`): schema, explicit grants and row-level security for learners, facilitators, organisation admins, content reviewers and platform admins, consent-aware staff functions, retention job.
- **Content** (`content/`): lessons, lexicon, clips and interface lines as versioned JSON with JSON Schemas; compiled per lesson and language at build time ([docs/curriculum.md](docs/curriculum.md)).
- **Tutor** (`src/server/tutor/`, `src/server/providers/`): capability-gated tiers with Lelapa AI Vulavula (speech-to-text), Anthropic Claude (intent classification) and a deterministic development adapter ([docs/ai-and-speech.md](docs/ai-and-speech.md)).

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: lint, types, content validation, generated-file checks and unit tests; then a local Supabase stack in the runner for the database tests, the end-to-end tests and the Lighthouse budgets (first-screen JavaScript under 200 KB, every lesson under 2 MB). Reports are uploaded as artefacts. Latest local results: [docs/test-results.md](docs/test-results.md).

## Documentation

| Document | For |
|---|---|
| [docs/curriculum.md](docs/curriculum.md) | Levels, lessons, components, content files, adding lessons |
| [docs/learning-engine.md](docs/learning-engine.md) | Evidence, mastery, XP, streaks, revision, placement, sync |
| [docs/ai-and-speech.md](docs/ai-and-speech.md) | Tutor tiers, providers, development adapter, cost controls |
| [docs/capability-matrix.md](docs/capability-matrix.md) | Provider matrix and the evaluation protocol for each language |
| [docs/data-inventory.md](docs/data-inventory.md) | POPIA data inventory: what is stored, where, why, who sees it, how long |
| [docs/consent-scripts.md](docs/consent-scripts.md) | Spoken consent scripts in isiZulu and Sesotho (generated; draft, for review) |
| [docs/content-review-checklist.md](docs/content-review-checklist.md) | Checklist for native speakers, educators, linguists and AET specialists |
| [docs/language-validation.md](docs/language-validation.md) | Outstanding language, speech and curriculum validation |
| [docs/audio-recording-guidelines.md](docs/audio-recording-guidelines.md) | Recording manifest, sessions, naming and import |
| [docs/aet-alignment.md](docs/aet-alignment.md) | Proposed AET alignment (generated; requires accredited specialist review) |
| [docs/pilot-measurement-plan.md](docs/pilot-measurement-plan.md) | Pilot protocol, measures and the anonymised export |
| [docs/licences.md](docs/licences.md) | Image and audio licences and attribution |
| [docs/known-limitations.md](docs/known-limitations.md) | What does not work yet, honestly |
| [docs/next-steps.md](docs/next-steps.md) | Prioritised steps to a controlled pilot |
| [docs/test-results.md](docs/test-results.md) | Latest automated test and performance results |

## Licence

MIT (see `LICENSE`). Illustrations are original and under the same licence ([docs/licences.md](docs/licences.md)).
