# Security review and pilot readiness

Review of Yomu for a controlled adult-literacy pilot in South Africa, 27 October 2026. It covers learner registration, PIN handling, facilitator-assisted resets and moves, staff authentication, the authorisation of every server route, and deletion and consent withdrawal. The learning engine, offline-first design, native-language pathways, consent requirements and accessibility features were kept as they were. No AI provider was enabled, no draft content was marked approved, nothing was deployed and no live database was touched.

**Method.** Each finding was reproduced against the code as it was, in the local Supabase stack (Postgres, Auth and PostgREST, the same versions CI uses), by calling the real route handlers with real Auth sessions. Fault injection (failing inserts, refused Auth deletes, lost replies) and parallel requests were used where atomicity or races were in question. Each fix has a regression test, and most of these tests were shown to fail on the previous code. The changes are in seven stacked pull requests, merged in order:

| PR | Change |
|---|---|
| [#2](https://github.com/KingsmanRon/Yomu/pull/2) | Atomic, server-authorised learner registration |
| [#3](https://github.com/KingsmanRon/Yomu/pull/3) | PIN attempts counted atomically; assisted PIN reset atomic with its audit |
| [#4](https://github.com/KingsmanRon/Yomu/pull/4) | Transactional, idempotent, recoverable move to a new phone |
| [#5](https://github.com/KingsmanRon/Yomu/pull/5) | Mandatory staff two-step sign-in with secure recovery |
| [#6](https://github.com/KingsmanRon/Yomu/pull/6) | Authorisation review of every service-role route |
| [#7](https://github.com/KingsmanRon/Yomu/pull/7) | Complete deletion and consent withdrawal (server, Auth, phone) |
| #8 | This report |

New database migrations, applied in order by `npx supabase db push` (never run against the pilot database without authorisation): `20261027100000_atomic_registration`, `20261027110000_pin_attempts_and_assisted_reset`, `20261027120000_recoverable_device_transfer`, `20261027130000_staff_mfa`, `20261027140000_client_error_cap`, `20261027150000_complete_learner_deletion`.

## 1. Confirmed vulnerabilities and defects (fixed)

Severity reflects this pilot: few staff, few hundred learners, minimal personal data (no names, phone numbers or ID numbers).

| # | Finding | Severity | Evidence (reproduced before the fix) | Fix and regression test |
|---|---|---|---|---|
| V1 | **Parallel PIN guessing bypassed the attempt limit.** The count was read, the PIN verified and the count written back as separate steps. | High | 20 parallel wrong guesses through the PIN check were all verified; `failed_attempts` ended at 1 with no wait. The same check guarded moves to a new phone, so a facilitator account could try the whole 6,561-code space in minutes and move a learner to a phone it controls. | #3: the attempt is counted under a row lock before verification. `tests/db/pin.test.ts`: 20 parallel guesses → 5 checked, 15 told to wait. |
| V2 | **Staff password alone gave access to learner data** (progress, and shared mistakes and tutor questions). | High | By design before #5: no second factor existed. | #5: aal2 required by the server and inside every staff RLS helper. `tests/db/mfa.test.ts` (5 of 12 fail with the checks removed). |
| V3 | **Stale class links kept assisted-mode powers.** A `cohort_facilitators` link was trusted without checking that the person still had the facilitator role in that class's organisation. | Medium | A facilitator whose role was now in another organisation could still reset PINs and move learners of a class linked to them earlier. | #3/#4: authorisation re-checked in the transaction, with rows locked. `pin.test.ts` and `transfer.test.ts` ("stale class link"). |
| V4 | **Any authenticated account could register as a learner**, and registration was several writes with compensating deletes. | Medium | A staff session registered as a learner. Six concurrent registrations caused server errors. A crash between writes could leave a learner without consent or credentials. | #2: `register_learner()` runs in one transaction, accepts anonymous sessions only and is idempotent. `tests/db/registration.test.ts` (2 failed before). |
| V5 | **Assisted PIN reset could change the PIN without an audit record.** | Medium | With the audit insert failing, the PIN was already changed. | #3: `assist_reset_pin()` changes the PIN and writes the audit record in one transaction. Fault-injection test. |
| V6 | **Moving a learner to a new phone was not transactional.** | Medium | A retry after a lost reply returned 409 although the move had happened. An injected audit failure left the PIN changed. Two simultaneous moves both returned 200. The old phone's Auth user deletion was unchecked. | #4: `transfer_learner()` uses an idempotency key, one transaction, an expected-old-binding check and explicit `revocation_pending` with retries. `tests/db/transfer.test.ts` (11) and a two-phone end-to-end test. |
| V7 | **Anyone could pre-register a future staff email address** (public sign-up with confirmations off). | Medium | Self sign-up produced a usable session. | #5: email confirmations on, and staff accounts are created confirmed by an administrator. Test: self sign-up → `email_not_confirmed`. |
| V8 | **Signed-out or revoked staff sessions kept database access** until the access token expired (up to 1 hour). | Medium | PostgREST accepted a token whose Auth session had been deleted. | #5: `staff_mfa_verified()` also requires the token's session to still exist at aal2. Test: a sign-out cuts database access at once. |
| V9 | **The developer tutor lab needed no sign-in when enabled** (outside production, or with `DEV_TOOLS_ENABLED`). It runs paid providers against the daily spending cap that learners share. | Medium | An unauthenticated request was processed: the route checked only the dev-tools switch. | #6: platform administrator or content reviewer at aal2. `tests/db/routes.test.ts`. |
| V10 | **An Auth outage was reported as 401.** The app reads 401 as "moved to another phone" and offers to remove the learner's copy. | Medium | Any Auth error, network failures included, became 401. | #7: outages now return 503 `auth_unavailable`. `tests/unit/server-auth.test.ts`. |
| V11 | **Deleting an account left Auth records behind.** The anonymous Auth user, session and refresh token of a phone the learner had been moved from (revocation pending) remained. | Low–Medium | Found by a scan of every app and Auth table after deletion. | #7: `delete_learner()` deletes the learner's and that phone's anonymous Auth users in the same transaction. `tests/db/deletion.test.ts` (fails on the previous function). |
| V12 | **A deletion whose reply was lost could not be finished on the phone.** | Low–Medium | The retry found the session gone (401) and the app treated that as a failure. | #7: the app records the request, and a repeated attempt finishing on 401/403 counts as done. End-to-end test with a dropped reply. |
| V13 | **Unauthenticated error reports were stored without limit.** | Low | 3 requests of 20 reports were all stored. | #6: `log_client_errors()` stores at most 30 per minute in total. Route test. |
| V14 | **Queued usage events of a deleted profile stayed on the phone** until the next start. They were never sent. | Low | Unit test with the previous `deleteProfile`. | #7: one local transaction removes the profile, its activity log and its queued events. |

## 2. Architectural risks (not fixed; need a decision or later work)

| # | Risk | Why it remains | Mitigation now | Suggested next step |
|---|---|---|---|---|
| R1 | **Hosted Supabase may refuse what local Supabase allows.** Security-definer functions read `auth.sessions` and delete from `auth.users`, `auth.sessions` and `auth.mfa_factors`. | Hosted projects restrict the `auth` schema more tightly than local. | Moves and deletions fall back to the Auth admin API and the retention job. **MFA recovery, the administrator reset and the live-session check have no fallback.** | Verify on the pilot project before go-live (blocker B3). If refused, move those steps to the Auth admin API. |
| R2 | **Limits of authenticator codes (TOTP).** Supabase Auth accepts the same code again within its window (tested). TOTP does not stop a phishing site that relays password and code in real time. Whoever first enrols with a staff member's password owns the account. | Inherent to TOTP and to Supabase Auth. | Two-step sign-in, live-session checks and audited resets. | Hand over initial passwords separately and enrol during facilitator orientation. Consider passkeys later. |
| R3 | **A facilitator can take over a learner in their class** by a "forgotten PIN" move to a new phone. | Needed for learners who forget their PIN. | aal2, class membership checked in the transaction, every move and reset recorded (`facilitator_assists`, `device_transfers`). | An organisation admin reviews assists weekly. Consider showing the learner past moves. |
| R4 | **No per-learner volume limits** on sync (2 MB per request) or usage events. Learner accounts can be created freely (anonymous sign-in, limited per IP by Auth). | Not needed at pilot scale. | Request size limits; the global cap on error reports. | Rate limiting at the host or per-learner daily quotas before scale-up. |
| R5 | **The phone's PIN protects against household members, not forensic access.** Four taps from nine pictures is 6,561 codes. With a copy of the phone's storage, the local PBKDF2 hash can be brute-forced in minutes. | Offline use needs a local check. | 150,000 PBKDF2 iterations with salt; local waits; the server limits online guessing (V1). | State this plainly in facilitator guidance. |
| R6 | **The service-role key gives full database access.** Every route uses it after its own checks. | Supabase architecture. | Route inventory test (every route classified); security-definer functions callable by `service_role` only. | Keep the key only in the host's secret store; rotate on staff changes. |
| R7 | **Supabase keeps logs we do not control.** Auth's audit log (staff two-step sign-in events with IP addresses; random user IDs for learners) and Supabase's platform logs (IP addresses). | Outside the app's tables. | Documented in [data-inventory.md](data-inventory.md). | Information officer decision 6. |
| R8 | **"Withdraw consent to online storage" is one tap.** It deletes the online account and class memberships; learning stays on the phone. | Existing design. | Data is not lost from the phone. | UX review: consider hold-to-confirm, as for "Delete everything". |
| R9 | **`POST /api/learner/pin` has no caller in the app.** | Kept as working functionality. | Secured (#3) and covered by the route inventory. | Remove it if no PIN-change screen is planned. |

## 3. Unverified assumptions

| # | Assumption | How to verify |
|---|---|---|
| A1 | The hosted project's Auth settings match `supabase/config.toml`: anonymous sign-ins on, email confirmations on, TOTP enrolment and verification on. | Check in the dashboard after creating the pilot project; run `tests/db/mfa.test.ts` against a disposable copy, never the pilot database. |
| A2 | Hosted Auth behaves like the tested GoTrue v2.197: `aal` and `session_id` claims; `/user` refuses deleted sessions; an aal1 session cannot enrol a second factor or remove a verified one; anonymous users have no identities. | Same as A1. |
| A3 | Hosted Auth rate-limits sign-in, anonymous sign-up and MFA verification per IP. Locally these limits were not enforced in tests. | Read the hosted project's rate-limit settings. |
| A4 | `pg_cron` is available, or an external scheduler calls `/api/cron/purge` daily. | Check after deployment. |
| A5 | IndexedDB multi-store transactions, Web Crypto and the service worker work on the pilot phones (entry-level Android, Chrome). | Real-phone testing ([next-steps.md](next-steps.md) step 5). |
| A6 | The scrubbing of error messages and usage-event properties removes personal data. It is heuristic: emails, phone-like numbers, tokens, keys. | Review a sample of stored error logs during the pilot. |
| A7 | Hosting region and cross-border transfer (POPIA section 72) are acceptable. | Information officer. |

## 4. Pilot-readiness matrix

Status: **Ready** = code and tests complete. **Conditional** = ready once the listed conditions are met. **Blocked** = cannot start without human work.

| Area | Status | Evidence | Blockers | Human validation required |
|---|---|---|---|---|
| Learner registration and spoken consent | Ready | #2: 8 DB tests; end-to-end onboarding in both languages with axe checks | — | Consent script wording ([data-inventory.md](data-inventory.md) decision 2) |
| Server PIN protection | Ready | #3: 9 DB tests, including 20 parallel guesses | — | — |
| Facilitator-assisted reset and move | Conditional | #3, #4: 20 DB tests; two-phone end-to-end test with the authenticator code | B3 (hosted Auth permissions; fallbacks exist) | Facilitator orientation; weekly assist review by an org admin (R3) |
| Staff authentication (two-step) | Conditional | #5: 12 DB tests; end-to-end set-up, sign-in, recovery, admin reset; axe on the staff two-step screens | B3, B4 | Initial-password handover; enrolment at orientation; identity check before any reset; at least two platform administrators |
| Authorisation of server routes | Ready | #6: route inventory test (25 routes) plus refusal tests per class | — | — |
| Deletion and consent withdrawal | Conditional | #7: database-wide trace scan, fault injection, end-to-end delete (with lost reply) and withdrawal | B3 (fallback exists) | Information officer decisions 5 and 6 |
| Offline-first learning and sync | Ready (unchanged) | End-to-end offline/online sync, two learners on one phone, slow 3G | B5 | Real-phone testing |
| Native-language pathways and accessibility | Ready (unchanged) | Both journeys end to end; axe: no WCAG 2.1 A/AA violations | — | Accessibility check with learners during the pilot |
| Lesson content and audio | **Blocked** | 875 spoken lines, none approved; placeholder audio | B1 | Native-speaker and educator review; recorded audio ([next-steps.md](next-steps.md) steps 2–3) |
| AI tutor | Off (Tier 1 only) | Capability matrix: nothing verified; providers `none` | Not needed for the pilot | Operator agreements and the evaluation protocol if ever enabled |
| Privacy governance (POPIA) | **Blocked** | [data-inventory.md](data-inventory.md) | B2 | Information officer sign-off: region, retention, breach procedure, decisions 1–7 |
| Pilot environment | **Blocked** (not authorised) | — | B3, B4 | Authorisation and budget; secrets (`PIN_PEPPER`, `CRON_SECRET`); migrations applied by an authorised operator |
| Retention job | Conditional | `purge_expired()` exercised by the DB tests | A4 | Confirm the daily run after deployment |
| Continuous integration | Ready | Lint, types, content checks, unit, DB, end-to-end and performance on every PR (see below) | — | — |

**Blockers**

- **B1.** Content review and audio recording.
- **B2.** Information officer sign-off.
- **B3.** On the pilot project, verify that the database functions may read and change Auth's `sessions`, `users` and `mfa_factors` (R1). Use a disposable copy, never the live database.
- **B4.** Hosted Auth settings (A1–A3) and staff onboarding: accounts created confirmed, two platform administrators, two-step sign-in set up.
- **B5.** Real-phone testing.

**Verdict:** the code-level hardening asked for is done and tested. The pilot must not start with learners until B1–B5 are cleared.

## 5. Continuous integration

GitHub Actions runs the same suites as above on every pull request: lint, types, content and generated-file checks, unit tests, then Supabase from scratch, database tests, end-to-end tests and Lighthouse budgets. Before this review `main` was green ([run 2](https://github.com/KingsmanRon/Yomu/actions/runs/40475373250)). Results for the hardening PRs (each run covers its own PR and every PR below it in the stack):

| PR | Run | Result |
|---|---|---|
| #2 | [40478967499](https://github.com/KingsmanRon/Yomu/actions/runs/40478967499) | Success |
| #3 | [40479614496](https://github.com/KingsmanRon/Yomu/actions/runs/40479614496) | Success |
| #4 | [40480822373](https://github.com/KingsmanRon/Yomu/actions/runs/40480822373) | Success |
| #5 | [40484894280](https://github.com/KingsmanRon/Yomu/actions/runs/40484894280) | Success |
| #6 | [40485678052](https://github.com/KingsmanRon/Yomu/actions/runs/40485678052) | Success (40 minutes: the runner's package installs took 30 of them) |
| #7 | [40488964714](https://github.com/KingsmanRon/Yomu/actions/runs/40488964714) | Success |

No test was skipped, weakened or removed. The end-to-end tests that used the shared development staff accounts now create their own accounts and complete two-step sign-in. Because one run came within 5 minutes of the 45-minute limit while the runner's package mirror was slow, the database and end-to-end job now has 60 minutes.
