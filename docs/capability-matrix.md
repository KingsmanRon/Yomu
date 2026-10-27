# Provider capability matrix

`config/capabilities.json` records, for every provider × language × capability, what has actually been verified. The app reads it at runtime and shows a capability to learners **only** when its entry is `verified`, names a verification date and verifier role, and is marked `learnerVisible`. Everything else falls back to the next lower tutor tier, ultimately Tier 1 (validated recorded clips), which needs no provider ([ai-and-speech.md](ai-and-speech.md)).

Safety rails:

- A file that is missing, malformed or unsafe (for example `learnerVisible` without `verified`, `verified` without a date and verifier role, a duplicate entry, or an entry without evaluation notes) is rejected as a whole and every AI tier is disabled (`src/server/tutor/matrix.ts`). The same checks run in the unit tests.
- A status change takes effect without a rebuild (the file is re-read when it changes).
- `npm run db:seed-content` copies the matrix into `provider_capabilities` for audit; the database refuses a learner-visible entry that is not verified.

## Current matrix (2026-10-26)

Capabilities: `stt` speech-to-text, `tts` text-to-speech, `translation`, `pronunciation_scoring`, `llm_dialogue` (intent classification and explanations).

| Provider | Language | Capability | Status | Learner-visible | Summary of the evaluation notes |
|---|---|---|---|---|---|
| Lelapa AI Vulavula | isiZulu | stt | experimental | no | Listed by the vendor (`zul`, also code-switched); adapter implemented, never run on real learner audio |
| Lelapa AI Vulavula | Sesotho | stt | experimental | no | Listed (`sot`); no word timings or confidence for Sesotho; South African Sesotho speech and spelling to be checked |
| Lelapa AI Vulavula | isiZulu, Sesotho | translation | experimental | no | Advertised; not integrated (the app never machine-translates learner content) |
| Lelapa AI Vulavula | isiZulu, Sesotho | tts | unsupported | no | No text-to-speech product found in the vendor documentation |
| Lelapa AI Vulavula | English | pronunciation_scoring | unsupported | no | No pronunciation assessment product found; the app uses self-check instead |
| Anthropic Claude | isiZulu, Sesotho | llm_dialogue | experimental | no | Adapter implemented; output for Tier 2 restricted to a fixed intent list; generation quality not evaluated by native speakers |
| Anthropic Claude | English | llm_dialogue | experimental | no | Only ever shown to facilitators, marked "AI-generated, unverified" |
| Device speech (Web Speech API) | isiZulu, Sesotho, English | tts, stt | unsupported | no | Not integrated: voices rarely available on entry-level phones; recognition sends audio outside our controls |
| Development adapter | isiZulu, Sesotho | stt, llm_dialogue, tts | unsupported | no | Deterministic stand-ins for tests and the developer lab; never shown to learners |

The full notes, including what must be confirmed on the first live call, are in the file itself.

**Result for learners today:** Tier 1 in both languages. No spoken questions (Tier 2), no generated speech (Tier 3), no pronunciation scoring.

## Evaluation protocol

A capability moves to `verified` only after this evaluation, carried out for each language separately and recorded in the entry's notes. Re-run it when the provider's model or version changes, or when `AI_LLM_MODEL` changes.

### Speech-to-text (Tier 2)

1. **Question set.** The Tier 2 help questions (hear it again, how does this work, slowly, how does this word sound, what sound does this letter make, what does it mean) plus off-topic and unclear questions: at least 40 prompts per language, written by a native speaker, including natural code-switching with English.
2. **Speakers.** At least 10 adult speakers per language, spread across age (including over 45), gender and region; for Sesotho, South African speakers.
3. **Conditions.** Recorded on entry-level Android phones through the app's own recorder, in a quiet room and in a typical noisy setting (taxi rank, workplace, home with television).
4. **Measures.** Word error rate per condition, judged against a native speaker's transcript, and the proportion of transcripts reported in the wrong language. Record the provider version and date.
5. **Pass.** Agreed with the evaluating linguist before testing. Suggested: the end-to-end intent check below passes; word error rate is reported, not used alone.

### Language model, intent classification (Tier 2)

1. Run the transcripts from the speech-to-text evaluation (not the clean scripts) through the classifier with the real lesson contexts.
2. **Measures.** Accuracy per intent; how often a reading-revealing intent (hear, letter, meaning) is chosen when the learner asked something else; off-topic recall (questions about money, health, personal matters must be off-topic); prompt-injection attempts in the transcript.
3. **Pass (suggested).** Overall accuracy at least 90%, off-topic recall at least 95%, no injection success. A wrong help intent is recoverable (the learner hears a validated clip and can ask again); a missed off-topic question is not acceptable.

### Text-to-speech and generated explanations (Tier 3)

Tier 3 needs both a verified voice and verified generation for the language.

1. **Voice.** Native speakers rate intelligibility and naturalness of the voice reading 50 lesson-style sentences (including English words inside isiZulu or Sesotho sentences). The voice must not sound like a child, a caricature or a non-South African accent.
2. **Generation.** A native speaker and an adult-literacy educator review at least 100 generated explanations per language, drawn from real unanswered questions: correct, consistent with the lesson's validated content, respectful adult tone, natural code-switching, South African Sesotho orthography (for example "dijo", "kgomo", not "lijo", "khomo"), no new curriculum claims or translations that contradict the lesson.
3. **Pass.** Zero content errors that would teach something wrong in the sample, and reviewer approval of tone. Until then, Tier 3 stays off.

### Pronunciation scoring

Only if a provider offers it: compare its scores with ratings by two trained listeners on recordings of learners at different levels. Enable only with strong agreement, and never for decoding mastery (reading mastery comes from tasks that do not depend on speech).

## Changing an entry

1. Run the evaluation above and keep the data (no learner audio is kept beyond the evaluation; evaluation participants consent separately).
2. Update the entry: `status`, `verifiedAt` (date), `verifierRole` (for example "native isiZulu speaker and adult-literacy educator"; no names), and the evaluation summary in `notes`. Set `learnerVisible` to `true` only when the capability should be offered.
3. Configure the provider (`AI_STT_PROVIDER`, `AI_LLM_PROVIDER`, keys), check `/dev/tutor` and `GET /api/tutor/capabilities?lang=…`, then run `npm run db:seed-content` to record the change for audit.
4. Watch `tutor_logs` and `tutor_unanswered_intents` during the first weeks; demote the entry to `experimental` at once if quality drops.
