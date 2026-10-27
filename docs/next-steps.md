# Next steps for a controlled South African pilot

In priority order. Steps 1–6 are required before any learner uses the app; the rest make the pilot better or prepare for what follows.

## Before the pilot (required)

1. **Name check.** Run a trademark and name-conflict search for "Yomu" (and "Funda English" if it is still considered) in South Africa before the name appears on anything public. Change `APP_NAME` if needed.
2. **Review the pilot lessons and the interface in both languages.** Native-speaker review, then educator review, of Levels 0–2 (nine lessons), the interface lines, feedback and tutor clips, and the placement activity ([content-review-checklist.md](content-review-checklist.md)). Fix and re-review. Linguist review of the contrastive tags. Budget: two native speakers and one educator per language, roughly a week each.
3. **Record the audio.** About 27 minutes of speech per language plus the English model audio, with a native-speaker director; import, listen, approve ([audio-recording-guidelines.md](audio-recording-guidelines.md)). Then build with `HIDE_UNAPPROVED_CONTENT=true` and check that every pilot lesson is present.
4. **Privacy sign-off.** The information officer reviews [data-inventory.md](data-inventory.md) and [consent-scripts.md](consent-scripts.md) and settles the open decisions: consent wording (who can see the data, responsible party's contact), retention of inactive accounts, hosting region, breach procedure. Re-record changed consent lines and bump `CONSENT_VERSION`.
5. **Real-phone testing.** Run onboarding, a lesson, offline use and sync on two or three entry-level Android phones (2 GB RAM, Android 8+, Chrome) on real mobile data, including a shared phone with several profiles. Measure first-load time and data used, and fix what breaks.
6. **Deploy a pilot environment (needs authorisation and budget).** A Supabase project in the chosen region (`npx supabase link`, `npx supabase db push`), the Next.js app on a host with HTTPS, strong secrets (`PIN_PEPPER`, `CRON_SECRET`), the daily retention job confirmed (`pg_cron` or a scheduler calling `/api/cron/purge`), staff accounts for facilitators and the research lead, `npm run db:seed-content`. Keep `AI_*_PROVIDER` at `none` unless step 9 is done. Back-ups and an error-log review routine.

## For the pilot

7. **Pilot materials.** The audio research-consent explanation and information sheet in both languages (reviewed like the app's scripts), the observation sheet, and the two parallel forms of the reading check ([pilot-measurement-plan.md](pilot-measurement-plan.md)). Ethics approval if results will be published.
8. **Facilitator orientation** (half a day) and the pilot classes, created with their QR codes.
9. *(Optional)* **Evaluate Tier 2 for one language** with Lelapa AI Vulavula and the language model, following [capability-matrix.md](capability-matrix.md). Only a verified entry may be turned on, and only with operator agreements in place. A pilot without Tier 2 is still complete: Tier 1 covers every help option.

## Improvements found while building

10. **A longer, parallel-form pilot assessment in the app** (about 10 items per section, forms A and B), so outcome measurement does not rely on the 16-item placement activity.
11. **Research consent in the app**: a spoken flow that records the `pilot_research` consent type (already in the schema) and lets the export include only consenting learners without a separate register.
12. **Halve the first-visit download**: precache the language-neutral shell first and only the chosen language's onboarding and first lessons after the language choice (about 3.3 MB today for both).
13. **Staff administration screen** for creating organisations and assigning staff roles (today done by the operator in the database), and multi-factor sign-in for staff.
14. **A self-service code reset** for learners without a facilitator, for example optional phone-number verification explained by audio (the brief's optional OTP), if the information officer accepts storing a phone number for those who choose it.
15. **More lessons** for Levels 3–5 (forms, transport information, money messages, short written answers), following the same review and recording path.
16. **Adaptive practice inside lessons**: an extra item for an objective after repeated errors, using the per-error evidence already recorded.

## After the pilot

17. Use the final export, the reading check and the interviews to decide on a larger evaluation with a comparison group, the content to fix first (most-failed exercises, unanswered questions), and whether the data cost per lesson is acceptable.
18. Accredited AET specialist review of the alignment before any certificate or funding claim.
