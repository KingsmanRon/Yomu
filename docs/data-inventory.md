# Data inventory (POPIA)

What Yomu stores, where, why, who can see it, and for how long. This is the product team's description of the system as built; it must be reviewed by the organisation's information officer before a pilot. Points that need a decision are listed at the end.

Principles the design follows:

- **Minimum data.** A learner is a picture, a four-tap secret code and a teaching language. No name, phone number, email, ID number or date of birth is asked for. A nickname is optional.
- **No audio is ever stored.** Listen-and-repeat recordings stay in the phone's memory and are discarded when the activity ends. A spoken question to the tutor (only when Tier 2 is verified, which it is not yet) is sent once to the speech-to-text provider and not kept by Yomu.
- **Nothing reaches the server before spoken consent.** A guest's learning stays on the phone. Registration happens only after the five-part spoken explanation and the learner's "yes" (see [consent-scripts.md](consent-scripts.md)).
- **The learner controls sharing.** Joining a class shares progress with that class's facilitators; mastery, mistakes and tutor questions are shared only if the learner says yes to each. Every change takes effect at once.
- **Deletion is self-service.** Me > Privacy > press and hold the red button deletes everything, on the phone and on the server, without contacting anyone.

## Who is who

| Role | How they sign in | What they can reach |
|---|---|---|
| Learner | Picture and secret code on the phone; an anonymous Supabase Auth session per profile after registration | Their own records only (row-level security) |
| Facilitator | Email and password | The classes they run; for each learner only the fields that learner chose to share (database functions check consent field by field) |
| Organisation admin | Email and password | Class-level counts for their organisation's classes; never tutor questions, never individual mistakes |
| Content reviewer | Email and password | Lesson content and review records; no learner data at all |
| Platform admin | Email and password | The anonymised pilot figures (aggregates only, groups under 5 suppressed) and every organisation's class counts. Staff roles are assigned by the operator in the database (there is no in-app screen for it yet) |
| Server (service role) | Server environment only | Everything; used only by API routes after they have authenticated and authorised the caller |

## On the learner's phone

| What | Where | Why | Kept until |
|---|---|---|---|
| Profile: picture, optional nickname, teaching language, settings (text size, captions, Wi-Fi only, microphone choice), onboarding progress | IndexedDB `yomu`, store `profiles` | Run the app offline; several learners can share a phone | The learner deletes the profile (Me > Privacy) or the browser data is cleared |
| Secret code as a salted PBKDF2-SHA256 hash (150,000 iterations) and wrong-code pause | `profiles` | Keep household members out of each other's progress | As above |
| Activity log: answers (correct, wrong, practised), lesson completions, progress within a lesson, assessments, level changes | IndexedDB store `ops` | All progress is calculated from this log, offline | As above; once synced it is also on the server |
| Queued usage events | IndexedDB store `analytics` | Sent only for learners who agreed to usage counts | Sent, or deleted at the next app start or sync: events of learners who said no at once; undecided events (onboarding, guests) after 24 hours; any event after 7 days |
| Supabase Auth session (access and refresh token) per registered profile | `localStorage` key `yomu-auth-<profile>` | Sync and online features | Removed on deletion, withdrawal, or removal from the phone |
| Facilitator session in assisted mode | Memory only | A facilitator resetting a code or moving a learner to a new phone | Signed out when the help ends; never written to the phone |
| App, lesson packs and audio | Service worker cache | Offline use; replays cost no data | Replaced by newer versions; the learner can remove downloaded packs in Me > Downloads |
| Listen-and-repeat recordings | Memory only | The learner compares their voice with the model | Discarded when the exercise ends |

## On the server (Supabase Postgres)

All learner-owned rows reference `learners.id` with `on delete cascade`: deleting a learner deletes all of it.

| Table | What | Why | Who can see it | Kept for |
|---|---|---|---|---|
| `learners` | Teaching language, picture ID, optional nickname, level, random pseudonym, link to the anonymous Auth user, created/updated, last active date | The account | The learner; facilitators of their classes (picture, nickname, level) | Until deletion |
| `learner_credentials` | Secret code as a salted, peppered scrypt hash; failed attempts; retry time | Sign in on a new phone, facilitator-assisted code reset | Nobody through the API (server only) | Until deletion |
| `device_profiles` | Which phone profile belongs to the learner | Sync | The learner | Until deletion |
| `consent_records` | Type (`account_storage`, `analytics`, `cohort_sharing`, `pilot_research`), scope, script version, language, method, time given, time withdrawn | Proof of consent | The learner (and in their export) | Until deletion |
| `cohort_memberships` | Class, status, the four sharing choices, joined/withdrawn time | Facilitated mode | The learner; that class's facilitators and organisation admins | Until deletion (a withdrawn membership keeps its row with everything unshared) |
| `facilitator_assists` | Code reset or move to a new phone, which facilitator, when | Audit of help given on the learner's phone | Server only; included in the learner's export | Until deletion |
| `sync_operations`, `learning_attempts`, `lesson_completions`, `assessment_results` | The activity log from the phone (see above), with the device's local date | Progress, evidence, pilot measures | The learner; facilitators see summaries, and individual answers only when the learner shares mistakes | Until deletion |
| `learner_progress`, `objective_mastery`, `learner_achievements`, `streak_days`, `revision_schedule` | Derived progress, recalculated by the server from the log | Faster reads, reports, completion evidence | The learner; facilitators according to sharing (progress; mastery with dates only if shared) | Until deletion |
| `tutor_requests` | Time and tier of each spoken question | Per-learner rate limit | Server only | 2 days |
| `tutor_logs` | Text of a spoken question (scrubbed of numbers and contact details) and the tutor's reply, intent, provider, whether generated | Quality review of the AI tutor | The learner; facilitators only if the learner shares tutor questions; never organisation admins or employer reports | `TUTOR_LOG_RETENTION_DAYS` (default 90) |
| `tutor_unanswered_intents` | Text of questions the tutor had no validated answer for, lesson and step, no learner identifier | Content authors write the missing clips | Server only (pilot export shows counts by step) | 12 months |
| `ai_spend_daily` | Estimated AI spend and request count per day | Global daily spending cap | Server only | Not personal data |
| `analytics_events` | Event name, short properties (screen, lesson, step, help option, language), random pseudonym | Usage counts, only for learners whose consent is in force (checked on every request) | Server only; platform admins see aggregates | 13 months |
| `error_logs` | Error message scrubbed of numbers and contact details, build, optional pseudonym | Fixing defects | Server only | 90 days |
| `join_attempts` | Whether a class code attempt succeeded | Stop code guessing | Server only | 2 days |
| `deletion_log` | That a deletion happened, when, and who started it; no identifier of the deleted learner | Accountability | Server only | Indefinitely (not personal data) |
| `staff_roles`, `organisations`, `cohorts`, `cohort_facilitators` | Staff role, optional display name, organisation, classes | Staff access | Staff according to role | Until removed by a platform admin |
| `content_assets`, `content_reviews` | Lesson lines and review decisions: reviewer role, user ID, notes, date | Content review workflow | Content reviewers, platform admins | With the content |
| Curriculum tables, `provider_capabilities` | Lessons, objectives, AET mapping, capability matrix copy | Reports and review tools | Public curriculum; staff | With the content |

Supabase Auth (`auth.users`) holds one anonymous user per registered learner (no email, no phone) and an email and password hash per staff member. Anonymous users that never became a learner are deleted after 7 days.

### Retention job

`public.purge_expired()` applies the retention periods above. It runs daily through `pg_cron` where available (scheduled by the migration) and can also be called with `GET /api/cron/purge` and `Authorization: Bearer $CRON_SECRET`. It also deletes learners whose Auth user was removed and not re-linked within 30 days.

## Leaving the system

| Request | How | Effect |
|---|---|---|
| Copy of my data (access) | Me > Privacy > copy of my information | `GET /api/learner/export`: one JSON file with everything above about the learner, except the code hash |
| Stop sharing with a class | Me > Privacy, per class | Immediate: facilitator queries check sharing on every call |
| Stop usage counts | Me > Privacy | Immediate on the server; queued events are deleted on the phone |
| Withdraw consent to online storage | Me > Privacy | The account and everything linked to it is deleted on the server; learning stays on the phone as a guest |
| Delete everything | Me > Privacy, press and hold | Deleted on the server (`delete_learner`, then the Auth user) and on the phone; analytics and error logs carrying the pseudonym are deleted too |
| Moved to a new phone | Facilitator-assisted move | The old phone's session is revoked; the old phone can remove its local copy |

## Data sent to other services

| Service | When | What is sent | Status |
|---|---|---|---|
| Supabase (database, Auth, hosting of the API) | Always, for registered learners | Everything in the server tables above | Required. The region must be chosen deliberately: outside South Africa, POPIA section 72 (cross-border transfer) applies. Supabase also keeps its own service logs (including IP addresses) under its own retention. |
| Lelapa AI Vulavula (speech-to-text) | Only when Tier 2 is verified for the language and configured | The audio of one spoken question (up to 10 seconds) | Not verified for learners; no audio is sent today |
| Anthropic Claude (intent classification) | Only when Tier 2 is verified and configured | The transcribed, scrubbed question, the English lesson context and the learner's random pseudonym | Not verified for learners; nothing is sent today |
| None | | No third-party analytics, advertising, fonts or tracking scripts are loaded | |

Before any AI provider is enabled for learners: an operator agreement (POPIA section 21) with each provider, confirmation of the provider's retention period and training use of inputs, and the cross-border assessment.

## Decisions needed from the information officer

1. **Retention of inactive accounts.** Learner records are kept until the learner deletes them. Recommendation: delete accounts with no activity for 24 months, after notice through the facilitator where there is one.
2. **Wording of the consent scripts.** See the review points at the top of [consent-scripts.md](consent-scripts.md) (who can see the data, the responsible party's contact details).
3. **Pilot research consent.** The `pilot_research` consent type exists in the schema but is not collected in the app yet. The pilot protocol ([pilot-measurement-plan.md](pilot-measurement-plan.md)) uses a facilitator-led, audio-explained consent until it is.
4. **Hosting region and operator agreements** with Supabase and any AI provider.
5. **Breach procedure.** POPIA section 22 notification to the Information Regulator and to learners. For learners without phone numbers or email, notification goes through facilitators and an in-app spoken notice; the procedure must be agreed with sponsoring organisations.
