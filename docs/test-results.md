# Test results

Latest local run of every automated suite, on 2026-10-27 in the development container (Linux, Node 22.22, local Supabase through the Supabase CLI 2.122 in Docker, Chromium from Playwright 1.63). CI (`.github/workflows/ci.yml`) runs the same suites on every pull request.

## Summary

| Suite | Command | Result |
|---|---|---|
| Lint and types | `npm run lint`, `npm run typecheck` | Pass |
| Content validation | `npm run content:validate` | 0 errors, 0 warnings. 875 spoken lines, none approved yet (all draft) |
| Generated files up to date | `content:schema`, `docs:aet`, `docs:consent`, `audio:manifest` with `-- --check` | Pass |
| Unit | `npm test` | **131 passed** in 11 files |
| Database (access per role, transactions, routes, deletion) | `npm run test:db` | **71 passed** in 7 files |
| End-to-end at 360 × 640 | `npm run test:e2e` | **14 passed** (7.4 minutes) |
| Accessibility (axe, WCAG 2.1 A and AA) | inside the end-to-end tests | **No violations** on 28 screens (the learner screens in both languages) |
| Performance budgets | `npm run perf:lighthouse` | **Within budgets**: first-screen JavaScript 152 KB of 200 KB; largest lesson 292 KB of 2 MB |

## Unit tests (Vitest)

| File | Tests | What they prove |
|---|---|---|
| `mastery.test.ts` | 12 | Repeat-only, recognition-only or tile-building-only evidence never produces decoding mastery; supported attempts and retries do not count; mastery needs enough different items; mastered objectives can need review while keeping their first mastery date; evidence declarations per component |
| `progress.test.ts` | 27 | XP (recalculated, never double-counted), forgiving streaks with grace days and local dates, Leitner revision weighted to failed decoding, placement rules, the learning path never blocking, badges, deterministic log ordering |
| `grading.test.ts` | 8 | Error classification (first, middle, last sound; meaning), letters, tiles, typing, tolerant tracing |
| `offline.test.ts` | 18 | Shared-phone profile isolation and PIN hashing, removing a profile with its queued usage events and saved sign-in, guest-to-registered migration of the log, sync merging and idempotency, audio never falling back to another language, a stalled or superseded clip never freezing the screen, usage counts leaving the phone only after the learner said yes, class codes |
| `sync-contract.test.ts` | 4 | Operations produced by the app pass the server's validation |
| `content-validation.test.ts` | 9 | The shipped curriculum passes; the validator rejects a missing language pathway, a lesson without exercises, an answer not among the options, a picture missing from the licence manifest, model audio in the wrong language, a reading objective without decoding; compiled lessons give every line audio or a labelled placeholder and never mix in the other teaching language |
| `capabilities.test.ts` | 7 | The shipped matrix is safe; nothing unverified is exposed; the development adapter never reaches learners; tier selection degrades offline or on failure |
| `tutor-server.test.ts` | 28 | Spoken questions: matrix gating, rate limits and the daily spending cap before any provider call, wrong-language transcripts refused, off-topic and unknown questions answered with validated clips, unanswered questions logged without a learner ID, scrubbing, timeouts and the circuit breaker; the Claude adapter (request shape, refusals, cost with fallback) and the Vulavula adapter |
| `tutor-tier1.test.ts` | 4 | Tier 1 clip choice and the supported-attempt rule |
| `staff-exports.test.ts` | 12 | Pilot export: suppression of groups under 5, pre/post pairing and change per section, retention, lessons per active week, most-failed exercises only with 5+ learners, unanswered questions, usage counts as unique consenting learners, no identifiers; completion evidence marks every AET mapping "proposed, not accredited"; the PDF is produced even with characters the font cannot draw |
| `server-auth.test.ts` | 2 | An Auth outage is answered 503, never 401 (which the app reads as "moved to another phone") |

## Database tests (local Supabase)

Every test uses real Auth users and calls the real route handlers or database functions; several inject faults (failing inserts, refused Auth deletes) or run requests in parallel.

| File | Tests | What they prove |
|---|---|---|
| `access.test.ts` | 17 | Row-level security per role: anonymous visitors read only the curriculum; learners only their own records, never secret-code hashes or server functions; facilitators see each learner only as far as that learner shares; organisation admins get totals, never individual activity; stopping sharing or leaving a class takes effect at once; reviewers record reviews under their own account; class codes resist guessing |
| `registration.test.ts` | 8 | Registration is one transaction, idempotent under retries and six concurrent requests, refuses staff and outdated consent, and leaves nothing behind when it fails midway |
| `pin.test.ts` | 9 | PIN attempts are counted before verification (20 parallel guesses: 5 checked, 15 wait); waits grow and are capped; an assisted reset and its audit record are atomic; resets are refused for other organisations, stale class links, org admins, learners and anonymous callers |
| `transfer.test.ts` | 11 | A move to a new phone is one transaction: idempotent retries return the recorded outcome, simultaneous moves cannot both win, failures leave nothing changed, the old phone's session is revoked (or recorded as pending and retried) |
| `mfa.test.ts` | 12 | Staff need two-step sign-in on every route and in the database; a signed-out session loses access at once; recovery codes are one-time, hashed and rate-limited (8 parallel wrong codes: 5 checked, 3 wait); administrator resets; learners need no second factor; self sign-up cannot sign in |
| `routes.test.ts` | 9 | Inventory of all 25 API routes with their access rule; every guarded route refuses missing or forged tokens, the wrong kind of account, the wrong staff role and password-only staff sessions without changing any table; the tutor lab needs a reviewer or platform admin; client error reports are scrubbed and capped |
| `deletion.test.ts` | 5 | After deleting an account, no column of any app or Auth table holds the learner's IDs; the Auth step can fail and still be completed by the route; only anonymous Auth users are ever deleted; a "no" to usage counts takes effect at once |

## End-to-end tests (Playwright, Pixel 5 emulation at 360 × 640)

| Test | Time | What it shows |
|---|---|---|
| First day in isiZulu | 42 s | Sound check, spoken language choice, demonstration, picture and code, guest save, placement choice, the first lesson to the end (with deliberate wrong answers), XP and streak, every main screen; only isiZulu audio is ever requested (and English model audio) |
| First day in Sesotho | 44 s | The same journey in Sesotho; no isiZulu audio |
| Captions under every spoken line | 2 s | What is spoken is always shown, with listen-again |
| Learning offline, synced when back online | 51 s | Registered learner goes offline, reloads from the service worker, finishes a lesson; the queue syncs when online and the server's XP and lesson count equal the phone's |
| Declining consent | 4 s | Nothing is stored online and no session is created |
| Usage counts | 48 s | Nothing is counted (not even anonymously) after "no"; after "yes" in Me > Privacy events arrive under the pseudonym with the lesson exit step; "no" again withdraws the consent and stops counting |
| Two learners on one phone | 55 s | A second learner is added from the picture picker with separate progress; wrong codes cause a pause (never a lockout) that survives a reload; the right code opens the first learner's own progress |
| Spoken questions not offered | 4 s | With no verified speech provider, the tutor offers tap-to-help only |
| Joining a class | 39 s | A new facilitator sets up two-step sign-in (and recovery codes) at the first sign-in and creates a class (code and QR shown); the learner joins with the code, shares mastery but not mistakes, and the facilitator sees exactly that |
| First visit on slow 3G | 6 s | First screen usable after 5.7 s with 163 KB of JavaScript (compressed) under CDP throttling (about 400 kbps, 400 ms latency) |
| A facilitator moves a learner to a new phone | 55 s | Two phones: the facilitator signs in on the new phone with password and authenticator code (a wrong code is refused), the learner enters their PIN, progress arrives, the move is recorded and the old phone learns it was signed out |
| Staff two-step sign-in, recovery and reset | 5 s | Code at sign-in, a wrong code refused, recovery with a recovery code and a new authenticator, a platform administrator's reset with the audit record |
| Delete everything, with a lost reply | 45 s | The first reply is dropped after the server deleted the account; trying again removes the profile, activity log, queued usage events and saved sign-in from the phone |
| Withdraw consent to online storage | 38 s | The account is deleted online; learning stays on the phone as a guest without the queued usage events or saved sign-in |

Times are from the full run; the two journeys and the usage-counts test were run again with the extended accessibility checks (times above include them).

## Accessibility

axe-core 4.14 with the WCAG 2.0 and 2.1 A and AA rules, on settled screens (reduced motion), found no violations on: sound check, language selection, demonstration, choosing a picture, making a secret code, save choice, spoken consent, usage-counts question, where to start, placement activity (introduction and an item), home, lesson introduction, teaching step, tutor help, an exercise, lesson complete, learning path, practice, progress, me, privacy, profile picker, PIN entry and class sharing choices; and in the staff area, two-step set-up, recovery codes and the code prompt. Lighthouse's accessibility score for the first screen is 100.

Automated checks are not a full audit: see [known-limitations.md](known-limitations.md).

## Performance

Lighthouse 13.5 against the production build (mobile, simulated slow 4G, 4× CPU slowdown):

| Measure | Result | Budget |
|---|---|---|
| Performance / accessibility / best practices | 91 / 100 / 100 | |
| First Contentful Paint | 0.76 s | |
| Largest Contentful Paint | 3.0 s | |
| Total Blocking Time | 217 ms | |
| Cumulative Layout Shift | 0 | |
| First-screen JavaScript (compressed, the scripts the first page loads) | 152 KB in 8 files | under 200 KB |
| JavaScript including the idle-time prefetch of the other screens (for offline use) | 212 KB | reported |
| Whole first page load | 236 KB | |
| Largest lesson with its audio and pictures | 292 KB (`l20-blending`, Sesotho); median 222 KB, smallest 120 KB | under 2 MB |
| Offline precache (service worker, both languages: onboarding audio, first lessons, Tier 1 clips) | 3.25 MB, downloaded once in the background | 3.5 MB |

The end-to-end slow-3G test measures the first screen usable after 5.7 s. Lesson sizes are with placeholder tones; recorded speech at the same bitrate (Opus 16 kbps) will be of similar size. None of this has been measured on a real phone yet.

## Defects found by testing in this phase, and fixed

- A learner who answered "no" to usage counts still had usage events sent without an identifier; guests' events too. Now nothing leaves the phone without a "yes", the server checks the consent on every request, and Me > Privacy has the promised control to change the answer.
- Two spoken lines requested at almost the same moment could leave a screen waiting forever (seen at the PIN confirmation; more likely on slow networks). Fixed in the audio player, with a unit test that reproduced the freeze.
- The committed recording manifest was missing a line; regenerated, and CI now checks it.
- The pilot export lacked several measures from the pilot plan (pre/post change, day-7 and day-30 retention, lessons per active week, most-failed exercises, unanswered questions, onboarding and lesson drop-off) and could not be limited to the pilot classes. Added.
- Earlier in this phase: the server role had no table privileges (registration failed), sync rejected partial score records, a reload skipped the wrong-code pause, the placement could be recorded twice after a reload, and several screens failed axe contrast and naming checks. All fixed with tests.

## Not covered by automated tests

Real phones, iOS Safari, real mobile networks, screen readers and switch access, load, and any real speech provider. See [known-limitations.md](known-limitations.md).
