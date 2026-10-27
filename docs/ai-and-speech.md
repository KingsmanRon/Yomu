# AI tutor and speech integration

How the tutor works, which providers it can use, and what is actually available to learners today. The short answer: **learners get Tier 1 (validated recorded clips) in both languages. Tiers 2 and 3 are implemented but switched off for learners**, because no speech or language provider has yet been verified for isiZulu or Sesotho with real learners (see [capability-matrix.md](capability-matrix.md)).

## Principles

- Learners cannot read a text reply, so the tutor speaks. Only recorded, validated audio is played, unless a generated voice has passed native-speaker evaluation for that language (none has).
- Curriculum before generation: lesson content is the source of truth. The tutor chooses among validated answers; it does not invent lessons, translations or explanations.
- No silent language substitution: a missing isiZulu or Sesotho capability is never filled with English speech or English text (`playableSource` in `src/learner/audio/player.ts` refuses audio in the wrong language; tested).
- Every tier degrades to the one below, and Tier 1 works offline.

## Tiers

| Tier | What the learner gets | Needs | Status |
|---|---|---|---|
| 1. Validated clip library | The help button offers: hear it again, how this works, slowly, hear the word, the letter's sound, what it means. The app picks the recorded clip or lesson line for the step on screen (`src/lib/tutor/tier1.ts`). | Nothing: works offline | **Available in both languages** (all clips are draft content with placeholder audio until recorded and reviewed) |
| 2. Spoken questions | The learner asks aloud; speech-to-text transcribes; a language model classifies the question into one of the same help options (or off-topic / can't answer yet); the app plays the matching validated clip. Nothing generated is played. | Verified speech-to-text **and** language model for the language | Implemented; not verified, so not shown |
| 3. Generated spoken answers | For questions with no validated clip, a short generated explanation spoken by a verified voice | Tier 2 plus a verified text-to-speech voice | Implemented on the server side; no isiZulu or Sesotho voice exists in the matrix, so never shown |

The app asks `GET /api/tutor/capabilities?lang=zu|st` which tiers are available. The answer comes from `tutorTiers()` (`src/lib/capabilities/tiers.ts`): a capability counts only when its matrix entry is `verified`, records a verification date and verifier role, and is marked `learnerVisible`; the configured provider must also be healthy (not tripped by the circuit breaker), and the phone must be online.

### The honesty rule

In a task that measures independent reading, help that reveals the answer (the word's sound, its first sound, its meaning) marks the attempt as *supported*, so it cannot count as reading on one's own. The tutor says so before revealing (clip `tutor.read_alone_first`). Spoken questions follow the same rule because they resolve to the same help options. Generated answers (Tier 3) always mark the attempt supported.

## Tier 2 request, step by step

`POST /api/tutor/ask` (`src/server/tutor/ask.ts`):

1. The learner must be signed in (registered); guests use Tier 1.
2. If the matrix does not verify speech-to-text and the language model for the language: `unavailable` (the app should not have offered the button).
3. Per-learner rate limit (`AI_RATE_LIMIT_PER_MINUTE`, `AI_RATE_LIMIT_PER_DAY`), then a reservation against the global daily spending cap (`AI_DAILY_SPEND_CAP_USD`) for the worst-case cost of the request, before any provider is called. Over either: `resting`, and the learner hears "the tutor is resting" while tap-to-help keeps working.
4. Speech-to-text, with a timeout (`AI_TIMEOUT_MS`). The audio (at most `AI_MAX_QUESTION_SECONDS`, default 10 s) is used once, in memory, and never stored. A transcript reported in another language than requested is rejected.
5. The transcript is scrubbed of numbers, email addresses and tokens.
6. The language model picks one intent from a fixed list. The reply format is constrained (structured output), so no generated text can reach the learner. Refusals and unparseable replies become "can't answer yet".
7. Help intents play the same validated clips as the help buttons; `off_topic` plays the validated clip "I can only help you with reading and writing English; let's continue"; `unknown` plays "I can't answer that yet, let's continue" and the question text is logged in `tutor_unanswered_intents` without any learner identifier, for content authors.
8. The exchange is logged as text in `tutor_logs` with an expiry date (`TUTOR_LOG_RETENTION_DAYS`, default 90). Never audio. Facilitators see these logs only if the learner chose to share tutor questions, and generated text is marked "AI-generated, unverified". Organisation (employer) reports never include them.
9. The actual cost is settled against the day's reservation. A provider failure keeps its reservation (the call may still have been billed), counts towards the circuit breaker (3 consecutive failures disable that provider for 5 minutes in this server process) and the learner hears "resting".

What a provider receives: the audio of the question (speech-to-text only), the scrubbed transcript, the lesson title and the item on screen in English (built on the server from the lesson, never from what the phone sends), the help options available, and the learner's random pseudonym. Never a name, phone number, learner ID or audio to the language model.

## Providers

The provider for each capability is chosen by environment variable; whether learners may use it is decided only by the matrix.

| Variable | Values | Adapter |
|---|---|---|
| `AI_STT_PROVIDER` | `dev`, `vulavula`, `none` | `src/server/providers/stt-vulavula.ts`, `dev-adapter.ts` |
| `AI_LLM_PROVIDER` | `dev`, `anthropic`, `none` | `src/server/providers/llm-anthropic.ts`, `dev-adapter.ts` |
| `AI_TTS_PROVIDER` | `dev`, `none` | `dev-adapter.ts` (placeholder tone only) |

All keys are server-only environment variables (`ANTHROPIC_API_KEY`, `VULAVULA_API_KEY`); the browser never sees them.

### Lelapa AI Vulavula (speech-to-text)

- Endpoint used: `POST {base}/api/v2alpha/transcribe/sync/file?lang_code=zul|sot`, header `X-CLIENT-TOKEN`, multipart audio file; reads `transcription_text` and `language_code` from the reply.
- From the vendor documentation (checked 2026-10-26): isiZulu (`zul`, including code-switched isiZulu) and Sesotho (`sot`) are listed for transcription; word timings and confidence are not available for Sesotho. Translation is advertised (not integrated: the app never machine-translates learner content). No text-to-speech or pronunciation assessment product was found.
- **Assumptions to confirm on the first live call:** the multipart field name (`file`) and the reply fields come from vendor examples, not a full schema. Whether the Sesotho model handles South African (not only Lesotho) Sesotho speech and spelling must be evaluated.
- Cost is estimated per minute (`VULAVULA_COST_PER_MINUTE_USD`, default 0.10 so the cap errs on the safe side; set your contracted price).

### Anthropic Claude (language model)

- Used for Tier 2 intent classification (structured output restricted to the intent list, low effort) and Tier 3 explanation drafts (two short sentences in the learner's language; off-topic returns nothing).
- Model: `AI_LLM_MODEL`, default `claude-opus-5-5`. A cheaper model such as `claude-haiku-5-5` can be chosen once it passes the same evaluation; re-run the evaluation whenever the model changes. For models that support it, requests opt into server-side fallback on refusal; the extra attempt is priced into the spending reservation.
- The system prompt limits the model to routing questions about the current English lesson, treats the transcript strictly as the learner's words (never as instructions), and classes anything else (money, health, legal, personal matters) as off-topic, answered with a validated clip.
- isiZulu and Sesotho generation quality for adult-literacy explanations has not been evaluated by native speakers.

### Device speech (Web Speech API)

Not integrated. Entry-level Android phones rarely have isiZulu or Sesotho voices, device English voices are not a validated pronunciation model, and browser speech recognition sends audio to a third party outside our controls.

### Pronunciation scoring

No provider offers verified pronunciation scoring for these learners, so **the app never scores pronunciation**. Listen-and-repeat uses a self-check: the learner records themselves (kept in the phone's memory only), plays it back next to the model audio and says whether it sounded the same. This is recorded as *practised*, never *mastered*. If the microphone is refused, the learner says the word aloud and continues.

## Development adapter

`src/server/providers/dev-adapter.ts` provides deterministic stand-ins so the whole pipeline can be developed and tested without credentials or cost. It is **not** speech recognition or AI:

- Speech-to-text: an upload whose content starts with `DEVTEXT:` is read as the transcript; real audio transcribes to an empty string.
- Language model: keyword rules in English, isiZulu and Sesotho map a transcript to an intent; explanations are labelled `[development adapter: …]`.
- Text-to-speech: a placeholder tone, never speech.

Its matrix entries are `unsupported` and not learner-visible, so it can never reach learners. The automated tests and the developer tutor lab use it.

**Tutor lab:** `/dev/tutor` (enabled outside production, or with `DEV_TOOLS_ENABLED=true`) runs a typed question through the real server pipeline (limits, matrix, logging) and shows each step. Wherever a database is configured, it can be used only by a platform administrator or content reviewer signed in at `/staff` with two-step sign-in, because paid providers spend from the daily cap that learners share. To exercise Tier 2 locally, point `CAPABILITY_MATRIX_PATH` at a copy of the matrix in which the development adapter is marked verified; never commit such a file.

## Cost controls

| Control | Setting | Default |
|---|---|---|
| Global daily cap across all learners (UTC day) | `AI_DAILY_SPEND_CAP_USD` | 5 |
| Per learner per minute / per day | `AI_RATE_LIMIT_PER_MINUTE` / `AI_RATE_LIMIT_PER_DAY` | 6 / 60 |
| Provider timeout | `AI_TIMEOUT_MS` | 15000 |
| Longest spoken question | `AI_MAX_QUESTION_SECONDS` | 10 |

The cap is enforced with a reservation in the database (`ai_reserve_spend`) before each call, so concurrent requests cannot overshoot it. Unknown models are priced as the most expensive known model.

## Tests

`tests/unit/tutor-server.test.ts` and `tests/unit/tutor-tier1.test.ts` cover: unverified capabilities never exposed; refusal of a transcript in the wrong language; rate limit and spending cap before any provider call; off-topic and unknown questions answered with validated clips; unanswered questions logged without a learner ID; scrubbing; timeouts, provider errors and the circuit breaker; Claude adapter request shape, refusal handling and cost (including fallback attempts); the Vulavula adapter's request and reply handling; Tier 1 clip choice and the supported-attempt rule.
