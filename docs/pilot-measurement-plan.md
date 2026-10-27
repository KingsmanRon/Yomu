# Pilot measurement plan and protocol

A controlled pilot with **15–30 adult learners per teaching language** (isiZulu and Sesotho) to find out whether Yomu helps adults learn to read English, whether they can use it, and what it costs them. This plan assumes the readiness steps in [next-steps.md](next-steps.md) are done first: above all, the lessons used in the pilot must be reviewed by native speakers and educators and recorded. **The app must not be piloted with today's draft content and placeholder audio.**

## Questions

1. **Learning:** do letter-sound knowledge, decoding of words never seen before, sight-word recognition and sentence reading improve between entry and the end of the pilot?
2. **Usability:** what proportion of learners complete onboarding and the first lesson without help, and where do learners get stuck?
3. **Engagement and retention:** how many lessons do learners complete per active week, and how many are still learning after 7 and 30 days?
4. **Cost to the learner:** how much mobile data does a lesson use?
5. **Content quality:** which exercises fail most often, and which questions does the tutor not yet answer?

The pilot is descriptive. With 15–30 learners per language and no comparison group it cannot prove that the app caused any change; it shows whether a larger, controlled evaluation is worth running and what to fix first.

## Design

| | |
|---|---|
| Sites | One or two sites per language (for example an employer's training room, an NGO or a Community Education and Training college), each with a facilitator |
| Participants | Adults 18+, speaking isiZulu or Sesotho at home, who cannot yet read simple English sentences. Learners who cannot read in any language are included (they start at Level 0). Participation is voluntary and unrelated to employment decisions. |
| Duration | 6 weeks of learning, plus an entry week and an exit week |
| Use | Self-directed on the learner's own or shared phone, suggested 3+ short sessions a week, plus one facilitated session a week at the site |
| Classes | One pilot class per site and language, created in the staff area (`/staff`). Only learners who gave research consent join it. |
| Content | The lessons the reviewed content covers (at least Levels 0–2 for a 6-week pilot), recorded and approved |
| Tutor | Tier 1 (recorded clips) only, unless a provider has passed the evaluation in [capability-matrix.md](capability-matrix.md) before the pilot |

## Consent

Two separate consents, both explained by audio in the learner's language, never by asking the learner to read:

1. **Research consent (the pilot).** In the entry session the facilitator plays a recorded explanation in isiZulu or Sesotho (drafted with the information sheet below, reviewed like the app's consent scripts) and answers questions. The learner says yes or no; the facilitator records the answer, the date and the script version in the pilot register (a paper or spreadsheet register kept by the research lead, not in the app: the app's `pilot_research` consent type exists in the database but has no screen yet). Learners who decline can still use the app; they do not join the pilot class and are not in the analysis.
2. **App consent** (in the app, spoken): saving learning online, optional usage counts, and what the pilot class may see. Pilot learners need to save online, join the pilot class and share their progress; sharing mastery is needed for completion evidence. **Usage counts must be asked as the app asks them**: learners who say no are still in the pilot, and their usage simply is not counted (the usability and drop-off figures then describe only learners who said yes; the facilitator's observation sheet covers everyone).

The information sheet, spoken and given on paper for family members to read, covers: who runs the pilot and how to contact them; what learners will do and for how long; that taking part is voluntary and they can stop at any time without any effect on their job, class or certificate; what is collected (the app's data, observation notes, short interviews) and that results are reported only as anonymous group figures; that the employer receives no individual research data; data costs and support; and how to delete their data (Me > Privacy).

If results will be published, obtain approval from a registered research ethics committee before recruitment.

## Measures

The anonymised export (`GET /api/admin/pilot-metrics?cohort=<pilot class id>&format=csv`, platform admins only; repeat `cohort=` for several classes) gives every figure per language and overall. It contains no names, nicknames, pseudonyms or IDs, and every figure that describes fewer than 5 learners is shown as `<5`.

| Question | Export metrics | Also |
|---|---|---|
| Learning | `pre_post_pairs`, `median_days_between_pre_and_post`, and per section (`letter_sounds`, `transfer_decoding` = words never seen in lessons, `sight_words`, `sentence_reading`, plus `letter_recognition`, `hl_decoding`): `pre_*_median_pct`, `post_*_median_pct`, `change_*_median_points`, `improved_*`; `median_objectives_mastered`, `learners_with_any_objective_mastered` | Facilitator's reading check (below) |
| Usability | `completed_a_lesson` (of `learners_registered`), `onboarding_reached_<screen>`, `onboarding_completed`, `most_common_exit_<n>`, `help_requests_<option>` | Observation sheet: whether each learner completed onboarding and the first lesson without help, and where help was needed |
| Engagement | `median_lessons_per_active_week`, `retention_day_7_pct`, `retention_day_30_pct`, `active_last_7_days`, `median_active_days`, `median_longest_streak_days` | |
| Cost | `mean_kb_downloaded_per_lesson`, `median_kb_downloaded_per_lesson` (measured on the phone while a lesson is open) | Lesson pack downloads at the site's Wi-Fi do not cost the learner |
| Content quality | `most_failed_exercise_<n>` (first tries without help, listed only when 5+ learners tried), `first_try_accuracy_<type>`, `revision_accuracy`, `most_unanswered_<n>` (Tier 2 only) | Facilitator notes |

### Pre- and post-assessment

- **Entry (week 0):** every learner completes the placement activity in the app during the entry session, **without skipping it** (the skip option exists for self-directed learners; in the pilot the facilitator asks learners to try it, and it never shows a score). If a learner skipped it, they take it from Me > retake the placement activity in the same session; the export uses the first assessment actually taken.
- **Exit (week 7):** every learner takes it again from Me > retake. The export pairs it with the entry assessment when both use the same instrument version (`placement-v1`) and are at least 14 days apart.
- **Limitation:** the in-app instrument is a short placement tool (2–3 items per section, the same items at entry and exit), so a section score moves in large steps and learners may remember items. Treat its results as indicative. For the pilot, the facilitator also runs a **reading check** at entry and exit: 10 letter sounds, 10 decodable words not used in the lessons, 10 sight words and 5 short sentences, read aloud one to one and scored right or wrong on a sheet, with two parallel forms (A at entry, B at exit). Building these items into a longer in-app pilot form is listed in [next-steps.md](next-steps.md).

### Observation sheet (facilitator)

For each learner in the entry session: language; whether onboarding was completed without help (yes / with help at which screen / not completed); whether the first lesson was completed without help (same); time taken; anything that confused the learner. During the pilot: questions learners brought to the facilitated sessions, technical problems, and anything the learner said about data costs or the shared phone. No names on the sheet: use the class code and the learner's picture.

## The facilitator's role

- **Before:** completes a half-day orientation (the app, the observation sheet, the reading check, consent, privacy). Creates the pilot class and prints its QR code and number.
- **Entry session (60–90 minutes, groups of up to 8):** research consent; helps install the app (or uses loan phones); watches learners go through onboarding, **helping only when a learner asks or has been stuck for about two minutes**, and records it; makes sure each learner saves online, joins the class and takes the placement activity; runs the reading check one to one.
- **Weekly session (60 minutes):** learners practise together; the facilitator reviews class progress in the staff area (only what each learner shares), helps learners who are stuck, resets forgotten codes or moves a learner to a new phone with assisted mode (the learner always chooses the new code), and notes questions and problems.
- **Never:** reads or types a learner's code, reports individual progress to an employer, or pressures a learner to share more than they chose.
- **Exit session:** retake of the placement activity, reading check (form B), a short interview in the learner's language (what helped, what was hard, what they would change), and completion evidence for learners who want it (CSV or PDF; "proposed mapping, not accredited").

## Support for learners

- No cost to learners. The sponsor provides a data bundle per learner per month or Wi-Fi at the site for downloading lesson packs (Me > downloads shows each pack's size before downloading; a Wi-Fi-only setting is available).
- Loan phones for learners without a suitable phone, with one profile per learner (shared phones are supported, each profile protected by its own code).
- The weekly facilitated session and the facilitator's contact through the site for problems between sessions.
- Learners can stop at any time and delete their data themselves.

## Schedule

| Week | Activity | Export |
|---|---|---|
| Before | Readiness checks, facilitator orientation, ethics approval if publishing | |
| 0 | Entry sessions: consent, onboarding (observed), placement, reading check A | Baseline export (check pairs, data, any technical problems) |
| 1–6 | Self-directed learning, weekly sessions | Weekly export for the research lead (engagement, data, failed exercises), shared with content authors |
| 3 | Mid-point review: fix content or technical problems found so far (record any change in the pilot log) | |
| 7 | Exit sessions: retake, reading check B, interviews | Final export |
| 8 | Analysis and report | |

## Analysis

- Per language and overall; descriptive: medians and counts, never individual results.
- Learning: median entry and exit scores per section and the number of learners who improved, from the app and from the reading check; report both, with their limitations.
- Usability: proportion completing onboarding and the first lesson without help (observation sheet), screens and steps where learners stopped (export and observation).
- Engagement: lessons per active week, retention at day 7 and day 30.
- Cost: mean and median data per lesson; compare with a typical small data bundle.
- Content: the ten most-failed exercises and unanswered questions go to content authors with the facilitators' notes.
- Store exports and sheets in the research lead's secure folder; delete raw sheets after analysis according to the ethics approval.

## Success signals for a larger evaluation

Set before the pilot starts with the sponsor and educators; suggested: most learners complete onboarding without help; median day-30 retention above 50%; median data per lesson below 500 KB; a clear median gain in letter sounds and decoding of new words on the reading check; no content error reported that taught something wrong.
