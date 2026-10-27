# Outstanding language and curriculum validation

Everything below needs real isiZulu and Sesotho speakers or education specialists. None of it has been done: the product team wrote all language content as a draft, and no provider has been tested with real learners. Software checks (schema validation, both pathways present, no English audio standing in for home-language audio) pass, but they cannot tell whether a sentence is correct, natural or good teaching.

## What is waiting

| Item | Size | Status | Who validates |
|---|---|---|---|
| isiZulu spoken lines | 397 (153 interface, 69 instructions, 44 teaching, 40 home-language model words and letters, 38 meanings of English words, 19 feedback, 19 titles, 13 tutor replies, 2 placement) | all `draft` | Native speaker, then adult-literacy educator |
| Sesotho spoken lines | 397 (same breakdown; 41 model words and letters, 43 teaching) | all `draft` | Native South African Sesotho speaker, then educator |
| English model audio | 81 letter sounds, letter names, words, sentences | `draft` | Educator or phonics specialist; South African English voice |
| Recordings | 875 lines, about 56 minutes of speech | 0 recorded; placeholder tones | Voice talent with a native-speaker director ([audio-recording-guidelines.md](audio-recording-guidelines.md)) |
| Consent and privacy scripts | 41 lines per language ([consent-scripts.md](consent-scripts.md)) | `draft`; six open review points | Native speakers and the information officer |
| Contrastive phonology tags | 7 tags, on 8 objectives in 6 lessons | `draft` | Linguist with knowledge of both languages |
| AET alignment | 12 proposed outcome descriptors, every objective mapped | `proposed_unreviewed` | Accredited AET specialist ([aet-alignment.md](aet-alignment.md), `docs/aet-alignment.csv`) |
| Placement instrument | 16 items per learner across 6 sections | Not validated | Educator; reading specialist for the pilot reading check |
| Pictures | 81 original illustrations | Not reviewed by learners | Educators and a few learners from each language group |
| Speech-to-text, language model, text-to-speech | Per language | `experimental` or `unsupported` | Evaluation in [capability-matrix.md](capability-matrix.md) |

## What each validation must establish

### Language (native speakers)

- Every line is correct, natural and respectful for an adult; code-switching sounds like real speech.
- **Sesotho uses South African orthography throughout** ("dijo", "kgomo", "tjhelete", "o"), never Lesotho spellings. The validator warns on a few known Lesotho forms (`npm run content:validate -- --strict`), but only a reviewer can confirm the whole text.
- Meanings given for English words are the everyday word speakers use; regional alternatives noted.
- Both pathways say the same thing: compare each isiZulu line with its Sesotho counterpart and, for interface and consent lines, with the English source.

Checklist: [content-review-checklist.md](content-review-checklist.md).

### Teaching (adult-literacy educators)

- Explanations teach what the exercises then test; feedback per error type is right and encouraging.
- Letter sounds versus letter names are handled correctly; English model audio uses pure sounds.
- Contrastive notes help rather than confuse (for example, the isiZulu explanation that English "c" in "cat" is /k/, not a click).
- Level 0 (home-language decoding) is a sound bridge for learners who cannot read any language, and the move into English (lesson `l02-bridge`) is clear.
- Lesson order and length suit adults with little schooling; real-world texts look like South African SMSs, signs and notices.
- The placement activity places learners sensibly; the reading check for the pilot ([pilot-measurement-plan.md](pilot-measurement-plan.md)) has two parallel forms of equal difficulty.

### Speech quality

- **Recordings:** clear, natural, correct text, consistent loudness; English model audio with a clear South African accent. Approved in the review tool only after listening.
- **Speech-to-text (Tier 2):** word error rate and wrong-language rate on adult speakers' recorded questions, quiet and noisy, on entry-level phones, judged by a native speaker; then intent accuracy and off-topic recall end to end.
- **Generated speech (Tier 3):** voice naturalness and intelligibility rated by native speakers; generated explanations reviewed for correctness, tone and orthography.

Protocols and pass criteria: [capability-matrix.md](capability-matrix.md#evaluation-protocol).

### Curriculum alignment (accredited AET specialist)

For every row of `docs/aet-alignment.csv`: whether the mapping is appropriate, the correct AET level, and the official reference (for example a SAQA unit standard or curriculum document). Until an outcome is marked `specialist_reviewed` with its official reference, every report, export and certificate says "proposed mapping, not accredited".

## Order of work

1. Native-speaker review of the lessons planned for the pilot (Levels 0–2 first), the interface lines and the consent scripts; fix and re-review.
2. Educator review of the same lessons and the placement activity; linguist review of contrastive tags.
3. Information officer sign-off on consent scripts and [data-inventory.md](data-inventory.md).
4. Recording, import, listening review and approval.
5. AET specialist review (needed before any certificate or funding claim, not before a pilot).
6. Provider evaluations, only if Tier 2 is wanted in the pilot.

## Recording the result

Review decisions are made in the staff review tool (`/staff/review`) and brought into the content files with `npm run content:pull-reviews`, so the files in git always show each line's status and history. Matrix changes are recorded in `config/capabilities.json` with date and verifier role. AET reviews are recorded in `content/aet/outcomes.json` and the alignment document is regenerated.
