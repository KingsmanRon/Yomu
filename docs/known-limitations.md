# Known limitations

What the MVP does not do, does only partly, or has not been tested on. Each item says what is true today; [next-steps.md](next-steps.md) puts them in order for a pilot.

## Not ready for learners yet

- **All language content is draft, and all audio is placeholder tones.** Every isiZulu and Sesotho line was written by the product team, not by native speakers, and no line has been recorded. The app works end to end, but nothing may be used with real learners until the content is reviewed and recorded ([language-validation.md](language-validation.md)). The amber "unreviewed content" marker shows this in the app; `HIDE_UNAPPROVED_CONTENT=true` would currently hide every lesson.
- **The AET mapping is a proposal**, not accredited; every export says so.
- **The product name needs a trademark and name-conflict check before any public launch.** "Yomu" is the current name and "Funda English" was the working name in the brief; several South African literacy organisations and programmes use similar names (for example names built on "funda", "to learn/read" in Nguni languages). The name is one configuration value (`APP_NAME` in `src/config/app.ts`, overridable with `NEXT_PUBLIC_APP_NAME`), so a change is cheap.

## Tutor and speech

- **Only Tier 1 (recorded clips) is available to learners.** Spoken questions (Tier 2) and generated spoken answers (Tier 3) are implemented and tested with the development adapter, but no provider is verified for isiZulu or Sesotho, so the app does not offer them ([capability-matrix.md](capability-matrix.md)).
- **The Vulavula adapter has never made a live call.** Its multipart field name and reply fields come from vendor examples; confirm them on the first authorised call.
- **No isiZulu or Sesotho text-to-speech voice** is known to exist at the required quality, so Tier 3 cannot be enabled even after language-model evaluation.
- **No pronunciation scoring.** Listen-and-repeat is a self-check (recorded only as practised). This is deliberate: no verified scoring exists.
- **The tutor answers from a fixed set of help options.** It cannot discuss a learner's own question beyond them unless Tier 3 is verified.
- The circuit breaker that disables a failing provider is held in each server process's memory (rate limits and the spending cap are in the database and shared).

## Learning design

- **Thirteen lessons.** Levels 0–2 have three lessons each; Levels 3–5 have one or two. Enough for a short pilot of the early levels, not a full course.
- **Adaptivity is rule-based:** placement, the open-next-lesson path and spaced revision weighted to failed decoding. Difficulty does not adapt inside a lesson, and the share of English in explanations rises only through the level sequence.
- **The placement activity is short** (2–3 items per section, the same items each time). It is a placement tool, not an outcome measure; the pilot adds a facilitator reading check ([pilot-measurement-plan.md](pilot-measurement-plan.md)).
- Facilitators cannot change a learner's level remotely; the learner (or a facilitator on the learner's phone) does it in Me.

## Accounts and devices

- **No phone-number registration (OTP).** The brief made it optional; the picture-and-code sign-in is the only one. Learners have no phone number or email on record, so the operator can contact them only through facilitators.
- **A forgotten code needs a facilitator** (assisted mode). A self-directed learner without a facilitator who forgets their code cannot reach their online copy; the phone's copy also stays locked behind the same code (with growing pauses, never a lockout).
- **One phone at a time.** Moving to a new phone goes through a facilitator and signs the old phone out; the old phone keeps its local copy until the learner removes it.
- **Browser storage can be cleared.** A guest's progress lives only in the browser's storage on that phone; clearing site data or uninstalling the browser loses it. Saving online protects against this.
- **First visit downloads about 3.3 MB** in the background (budget 3.5 MB): the app, the onboarding audio and the first lessons in both languages, so onboarding and the first lessons work offline. Before the language choice the app cannot know which half is needed.
- **Staff accounts** use email and password without multi-factor authentication, and roles are assigned by the operator in the database (there is no admin screen for it). The staff area is in English only (staff are literate users; learners never see it).

## Privacy and research

- **Research consent is not collected in the app.** The pilot uses a facilitator-recorded, audio-explained consent ([pilot-measurement-plan.md](pilot-measurement-plan.md)); the database already has the consent type.
- **Usage figures describe only learners who agreed to usage counts.** Those who said no are not counted at all, so onboarding and drop-off figures are biased towards learners who completed registration and said yes; the facilitator's observation sheet covers everyone.
- **Open decisions for the information officer** (retention of inactive accounts, consent wording, hosting region, operator agreements, breach procedure) are listed in [data-inventory.md](data-inventory.md).
- Questions the tutor could not answer are stored without a learner identifier, so they cannot be limited to one class in the pilot export.

## Testing and performance

- **Tested in emulation, not on real phones.** End-to-end tests run Chromium emulating a 360 × 640 Android phone, with network throttling and offline switching; Lighthouse uses simulated slow 4G and a 4× slower CPU. Nothing has been measured on a real 2 GB Android phone, and iOS Safari is untested.
- **First-screen JavaScript is about 152 KB** (budget 200 KB). The app then prefetches the other screens in idle time so they work offline, which brings scripts downloaded on a first visit to about 211 KB.
- **Largest Contentful Paint is about 3 s** in Lighthouse's simulated slow 4G run; the first screen is usable after about 5.7 s on the end-to-end test's slow-3G profile.
- **Automated accessibility checks (axe) are not a full audit.** No testing with screen readers, switch access or learners with low vision has been done.
- **No load testing.** Each sync recalculates the learner's progress from their whole log, which is fine at pilot scale; very long logs would need periodic snapshots.
- **The completion evidence PDF** uses a standard PDF font: characters outside Latin-1 (for example emoji in a nickname) are replaced.
