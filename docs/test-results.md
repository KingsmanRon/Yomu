# Test results

Latest local run of every automated suite, on 2026-10-27 in the development container (Linux, Node 22.22, local Supabase through the Supabase CLI 2.122 in Docker, Chromium from Playwright 1.63). CI (`.github/workflows/ci.yml`) runs the same suites on every pull request.

## Summary

| Suite | Command | Result |
|---|---|---|
| Lint and types | `npm run lint`, `npm run typecheck` | Pass |
| Content validation | `npm run content:validate` | 0 errors, 0 warnings. 875 spoken lines, none approved yet (all draft) |
| Generated files up to date | `content:schema`, `docs:aet`, `docs:consent`, `audio:manifest` with `-- --check` | Pass |
| Unit | `npm test` | **128 passed** in 10 files |
| Database access per role | `npm run test:db` | **17 passed** |
| End-to-end at 360 × 640 | `npm run test:e2e` | **10 passed** (4.3 minutes) |
| Accessibility (axe, WCAG 2.1 A and AA) | inside the end-to-end tests | **No violations** on 25 screens, in both languages |
| Performance budgets | `npm run perf:lighthouse` | **Within budgets**: first-screen JavaScript 152 KB of 200 KB; largest lesson 292 KB of 2 MB |

## Unit tests (Vitest)

| File | Tests | What they prove |
|---|---|---|
| `mastery.test.ts` | 12 | Repeat-only, recognition-only or tile-building-only evidence never produces decoding mastery; supported attempts and retries do not count; mastery needs enough different items; mastered objectives can need review while keeping their first mastery date; evidence declarations per component |
| `progress.test.ts` | 27 | XP (recalculated, never double-counted), forgiving streaks with grace days and local dates, Leitner revision weighted to failed decoding, placement rules, the learning path never blocking, badges, deterministic log ordering |
| `grading.test.ts` | 8 | Error classification (first, middle, last sound; meaning), letters, tiles, typing, tolerant tracing |
| `offline.test.ts` | 17 | Shared-phone profile isolation and PIN hashing, guest-to-registered migration of the log, sync merging and idempotency, audio never falling back to another language, a stalled or superseded clip never freezing the screen, usage counts leaving the phone only after the learner said yes, class codes |
| `sync-contract.test.ts` | 4 | Operations produced by the app pass the server's validation |
| `content-validation.test.ts` | 9 | The shipped curriculum passes; the validator rejects a missing language pathway, a lesson without exercises, an answer not among the options, a picture missing from the licence manifest, model audio in the wrong language, a reading objective without decoding; compiled lessons give every line audio or a labelled placeholder and never mix in the other teaching language |
| `capabilities.test.ts` | 7 | The shipped matrix is safe; nothing unverified is exposed; the development adapter never reaches learners; tier selection degrades offline or on failure |
| `tutor-server.test.ts` | 28 | Spoken questions: matrix gating, rate limits and the daily spending cap before any provider call, wrong-language transcripts refused, off-topic and unknown questions answered with validated clips, unanswered questions logged without a learner ID, scrubbing, timeouts and the circuit breaker; the Claude adapter (request shape, refusals, cost with fallback) and the Vulavula adapter |
| `tutor-tier1.test.ts` | 4 | Tier 1 clip choice and the supported-attempt rule |
| `staff-exports.test.ts` | 12 | Pilot export: suppression of groups under 5, pre/post pairing and change per section, retention, lessons per active week, most-failed exercises only with 5+ learners, unanswered questions, usage counts as unique consenting learners, no identifiers; completion evidence marks every AET mapping "proposed, not accredited"; the PDF is produced even with characters the font cannot draw |

## Database tests (row-level security, local Supabase)

17 tests in `tests/db/access.test.ts`, each with real users of each role:

- Anonymous visitors read the published curriculum and no learner data.
- Learners read only their own records, cannot write learning records or progress directly, never read secret-code hashes and cannot call server-only functions.
- Facilitators see each learner's progress only as far as that learner chose to share; mistakes and tutor questions only with consent; nothing of another organisation's class; no direct reads of learner tables.
- Organisation admins get class totals and completion evidence, never individual activity, mistakes or tutor questions.
- Stopping a kind of sharing hides it at once; leaving a class removes the learner from facilitators' lists and organisation totals.
- Deletion removes every learner-owned row and logs only that a deletion happened.
- Content reviewers record reviews under their own account only.
- Joining a class refuses unknown codes and slows down guessing.

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
| Joining a class | 39 s | A facilitator creates a class (code and QR shown); the learner joins with the code, shares mastery but not mistakes, and the facilitator sees exactly that |
| First visit on slow 3G | 6 s | First screen usable after 5.7 s with 163 KB of JavaScript (compressed) under CDP throttling (about 400 kbps, 400 ms latency) |

Times are from the full run; the two journeys and the usage-counts test were run again with the extended accessibility checks (times above include them).

## Accessibility

axe-core 4.14 with the WCAG 2.0 and 2.1 A and AA rules, on settled screens (reduced motion), found no violations on: sound check, language selection, demonstration, choosing a picture, making a secret code, save choice, spoken consent, usage-counts question, where to start, placement activity (introduction and an item), home, lesson introduction, teaching step, tutor help, an exercise, lesson complete, learning path, practice, progress, me, privacy, profile picker, PIN entry and class sharing choices. Lighthouse's accessibility score for the first screen is 100.

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
