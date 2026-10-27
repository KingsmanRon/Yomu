# Curriculum and lesson structure

Lessons are data, not code: versioned, schema-validated JSON under `content/`, compiled at build time into one small file per lesson per teaching language, and seeded into the database for reports and review. A reviewed lesson can be updated without changing application code.

**All language content is draft.** Every isiZulu and Sesotho line was written by the product team and every audio file is a labelled placeholder tone. Nothing may be used with real learners before native-speaker and educator review ([content-review-checklist.md](content-review-checklist.md)) and recording ([audio-recording-guidelines.md](audio-recording-guidelines.md)). The app marks unreviewed content with an amber marker.

## Levels

| Level | Title | Proposed AET level | Focus |
|---|---|---|---|
| 0 | Home-language reading bridge | Pre-AET | Decoding in isiZulu or Sesotho first (highly regular spelling), then carrying the skill into English. Offered when placement shows the learner cannot yet decode in their home language; can be skipped or revisited at any time; adds to Levels 1–5 and replaces none of their English content. |
| 1 | Foundations | AET 1 | English letter recognition, phonemic awareness, letter sounds, first letter formation |
| 2 | First words | AET 1 | Blending, word identification, spelling with tiles, picture matching, sight words |
| 3 | Sentences | AET 1 | Reading and building simple sentences, basic comprehension |
| 4 | Everyday English | AET 2 | SMS messages, signs, notices, typing short replies |
| 5 | Independent reading | AET 2 | Short passages, comprehension questions, short written answers |

The AET mapping is a proposal and is **not accredited**: see [aet-alignment.md](aet-alignment.md), which is generated from the content and marked for review by an accredited AET specialist.

## Lessons in this MVP

Thirteen lessons, each with full isiZulu and Sesotho pathways teaching the same English objectives. Each takes 4–7 minutes.

| Lesson | Level | Title | Objectives (mastery needs) | Components |
|---|---|---|---|---|
| `l00-hl-vowels` | 0 | Letters and sounds you already speak | read a home-language vowel (decode); hear a vowel and find its letter (recognise) | letter and sound recognition |
| `l01-hl-syllables` | 0 | Building syllables and reading your first home-language words | blend syllables (decode); read familiar words (decode, understand written); build a word from syllables (write) | letter and sound, picture-to-word, word building |
| `l02-bridge` | 0→1 | The same letters in English: what stays the same and what changes | letters that sound alike (recognise); letters that change, including clicks (recognise) | sound discrimination |
| `l10-satp` | 1 | English letter sounds: s, a, t, p | letter sounds (decode); hear the sounds (recognise); first blends (decode) | listen and repeat, letter and sound, picture-to-word |
| `l11-inmd` | 1 | English letter sounds: i, n, m, d (and c) | letter sounds (decode); hear the sounds (recognise); c says /k/ in English (decode) | listen and repeat, letter and sound |
| `l12-tracing` | 1 | Tracing and writing your first English letters | form letters (write); type letters (write) | tracing, typing |
| `l20-blending` | 2 | Blending three-sound words (cat, sit, map, pen) | read CVC words (decode); spell them (write); hear short vowels (recognise) | picture-to-word, word building, minimal pairs |
| `l21-picture-words` | 2 | Picture-to-word matching and building words with tiles | read words (decode, understand written); build words (write); understand spoken words | picture-to-word, word building |
| `l22-sight-words` | 2 | Common sight words (the, a, is, I, you) | read sight words (decode); type them (write) | letter and sound, picture-to-word, minimal pairs, typing |
| `l30-first-sentences` | 3 | Reading your first sentences ("I am at work.", "The bus is here.") | read sentences (decode, understand written); build sentences (write); understand spoken sentences | listening comprehension, picture-to-word, sentence construction, reading comprehension |
| `l40-sms` | 4 | Reading a simple SMS (appointment reminder, "Your airtime is low") | read an SMS (decode, understand written); type a reply (write) | real-world reading, typing |
| `l41-signs` | 4 | Reading common signs (Stop, Exit, Danger, Toilets, Open/Closed) | read signs (decode, understand written) | listen and repeat, real-world reading |
| `l50-job-notice` | 5 | Reading a job notice | read a notice (decode, understand written); write an answer (write) | reading comprehension, typing a short answer |

The writing strand runs through the levels: tracing (Level 1), building words with tiles (Levels 0–2), typing letters and words (Levels 1–2), typing an SMS reply (Level 4) and a short written answer (Level 5).

## The twelve lesson components

Every component speaks its instruction in the teaching language (replayable with one large button), plays target English audio at normal and slow speed, works by tapping (no dragging needed), gives feedback with sound, icon and colour together, has no time limit, and declares what its result is evidence of ([learning-engine.md](learning-engine.md)).

| # | Component | Lesson type | Notes |
|---|---|---|---|
| 1 | Listen and repeat | `listen_repeat` | Self-check against the model audio; recordings stay in memory; recorded as practised, never scored |
| 2 | Letter and sound recognition | `letter_sound` | Hear a sound and choose the letter, see a letter and choose its sound, or find a sound in a word |
| 3 | Picture-to-word matching | `picture_match` | Read the word, choose the picture (independent reading); or hear it; or name the picture |
| 4 | Word building with letter tiles | `word_build` | Tap tiles in order; after hearing the word or seeing a picture |
| 5 | Listening comprehension | `listening_comprehension` | |
| 6 | Sentence construction | `sentence_build` | Word tiles |
| 7 | Reading comprehension | `reading_comprehension` | A passage with no audio, then questions |
| 8 | Revision of missed exercises | Practice screen | Replays due exercises from the spaced-revision schedule |
| 9 | Letter tracing | `trace` | Touch strokes along a guide with tolerant checking |
| 10 | Minimal pairs | `minimal_pair` | Same or different; which word (ship / sheep, bat / bet) |
| 11 | Real-world reading | `real_world` | An SMS screen, a sign, a notice or a form field; find the key information |
| 12 | Phone-keyboard typing | `typing` | Type a heard word, copy a word, name a picture, answer a question |

Teaching steps between exercises explain a letter, sound or word in the home language, from templates (`letter_intro`, word introductions and so on) or lesson-specific lines.

## Contrastive phonology

Objectives are tagged where English differs from the home language, so that teaching and revision address it deliberately (`content/linguistics/contrastive-tags.json`; all tags are draft and must be validated by a linguist):

| Tag | What it covers |
|---|---|
| `ct.click-letters` | c, q and x are clicks in isiZulu; the isiZulu explanation for "cat" says that English c makes /k/ here |
| `ct.aspirated-th-ph` | th and ph are aspirated stops at home; th is a different sound in English |
| `ct.short-vowels` | English short vowels (bat / bet / bit) |
| `ct.vowel-length` | Short and long vowels (ship / sheep) |
| `ct.final-consonants` | English words end in consonants and clusters (desk, jobs) |
| `ct.irregular-spelling` | Sight words that do not follow the sound rules (the, said, you) |
| `ct.letter-names` | Letter names versus letter sounds |

## Content files

| Path | What |
|---|---|
| `content/curriculum.json` | Levels and units (titles in both languages) |
| `content/lessons/*.json` | One file per lesson: ID and version, level, unit, order, minutes, target (`en` or home language), title, summary, objectives (strand, mastery competencies, AET mapping, contrastive tags), prerequisites, steps (teaching steps and exercises with answers, distractors, per-error feedback overrides) |
| `content/lexicon/{en,zu,st}.json` | Letters, words and sentences with audio (English model audio, home-language glosses and explanations), pictures and contrastive notes |
| `content/tutor/clips.json` | The Tier 1 clip library: instructions, feedback per error type, help explanations, tutor replies |
| `content/app/lines.json` | Every spoken interface line, in both languages (with the English source for consent scripts) |
| `content/assessment/placement.json` | The placement activity |
| `content/aet/outcomes.json` | Proposed AET outcome descriptors with review status |
| `content/badges.json`, `content/images.json` | Badges; the image manifest with licences |
| `content/audio/` | Recording manifests (generated) and, once recorded, `recordings.json` |
| `content/schema/*.schema.json` | JSON Schemas (generated from the zod schemas in `src/lib/content/schema.ts`) for editor validation |

Every spoken line has an asset ID, the text to record, an optional context note for the voice artist and a review status (`draft`, `native_speaker_reviewed`, `educator_reviewed`, `approved`) with a history of reviewer roles and dates.

## Validation

`npm run content:validate` fails (and so does CI) when, among other checks:

- a lesson is missing exercises, an image (or the image is not in the licence manifest), an audio asset reference or a line on either language pathway;
- an answer is not among its options, options are duplicated, or two options share a picture (an ambiguous answer);
- an error type an exercise can produce has no feedback clip in both languages;
- an objective's mastery competencies cannot be earned on each pathway, a reading objective does not require independent decoding, or it has fewer than two independent-reading exercises (mastery would be impossible);
- `repeat` is used as a mastery competency;
- a model audio or meaning is recorded in the wrong language;
- references between files (lexicon, clips, AET outcomes, contrastive tags, prerequisites, units) are broken.

`--strict` also fails on warnings, such as possible Lesotho Sesotho spellings ("lijo" for "dijo").

## Production switches

- `NEXT_PUBLIC_SHOW_REVIEW_MARKERS` (default `true`): show the amber "unreviewed content" marker.
- `HIDE_UNAPPROVED_CONTENT=true` at build time: ship only lessons whose every line is approved. With today's content that hides every lesson, as it should.

## Adding or changing a lesson

1. Write or edit the lesson file (editors validate against `content/schema/lesson.schema.json`). Reuse lexicon entries and clips where they exist; add new ones with `draft` status.
2. `npm run content:validate`, then `npm run docs:aet` if objectives or AET mappings changed.
3. `npm run audio:manifest` to add the new lines to the recording manifest; `npm run audio:placeholders` for placeholders until they are recorded.
4. Send the new lines for review ([content-review-checklist.md](content-review-checklist.md)); reviews are recorded in the staff review tool and pulled into the files with `npm run content:pull-reviews`.
5. Bump the lesson `version` when its content changes after learners have used it; progress is kept by stable objective and exercise IDs, so never reuse an ID for something different.
6. `npm run db:seed-content` to update the database copy.
