# Content review checklist

For native isiZulu and Sesotho speakers, adult-literacy educators, linguists and AET specialists reviewing Yomu's lessons. Every line in the app is currently `draft`: written by the product team, voiced by placeholder tones. None of it may be used with real learners until it has passed this review and been recorded.

## Review stages

Each spoken line (script text, its audio, and the translation it carries) moves through:

| Status | Set by | Means |
|---|---|---|
| `draft` | Author | Written, not yet checked |
| `native_speaker_reviewed` | Native speaker of the language | Correct, natural, correctly spelled |
| `educator_reviewed` | Adult-literacy educator | Teaches the right thing, in the right way, for adults |
| `approved` | Educator or lead reviewer, after recording | Text and recorded audio both checked; ready for learners |

A review applies to the exact text reviewed. When an author changes a line's text, they set it back to `draft` for review again; the pull step never applies a review to text that has changed since it was reviewed, and a recording made from older text is flagged for re-recording. Reviewer role and date are recorded; no other reviewer personal data is kept.

## How to review

1. Sign in at `/staff` with a content reviewer account and open **Review content**.
2. Filter by language, status, kind (lesson line, tutor clip, interface line, model audio) or search. Each line shows its text, the note for the voice artist, where it is used, and its audio (a placeholder tone until recorded).
3. Choose a decision and your role, add a note when something must change (say what and why), and save. The line's status changes at once in the review tool.
4. The product team runs `npm run content:pull-reviews` to bring decisions into the content files (which remain the source of truth, versioned in git), fixes the lines that need changes, and re-seeds the database. Changed lines come back to you as `draft`.

Work lesson by lesson where you can: a line is easier to judge next to the exercise it belongs to. Ask for a test phone with the lesson open.

## Checklist for native speakers

Language

- [ ] Grammatically correct and spelled correctly.
- [ ] **Sesotho:** South African orthography throughout ("dijo", "kgomo", "tjhelete", "o" for "you"), not Lesotho spelling ("lijo", "khomo", "chelete", "u").
- [ ] **isiZulu:** standard orthography; hyphenation of English loanwords (for example "ku-inthanethi", "i-app") consistent across the app.
- [ ] Sounds like a real person speaking to an adult, not like a translation. Code-switching with English is fine where speakers would naturally do it (for example "app", "SMS", "Wi-Fi"); flag any English word a learner with little schooling would not know.
- [ ] The meaning matches the English source and the screen it is used on. Interface and consent lines carry their English source in `content/app/lines.json` and in [consent-scripts.md](consent-scripts.md).
- [ ] Short enough to hear in one go; one idea per line.

Tone and respect

- [ ] Adult and respectful: no childish words, no talking down, no exaggerated praise.
- [ ] Never shaming about mistakes or about not being able to read. Mistakes are part of learning.
- [ ] Neutral about gender, age, region and religion unless the lesson needs otherwise.

Words, names and pictures

- [ ] Example words, names and situations are familiar in South African adult life (work, transport, clinic, shop, family, phone, SMS, forms, signs, job seeking).
- [ ] Meanings (glosses) of English words are the everyday word a speaker would use; note regional alternatives.
- [ ] Pictures match the words for a South African adult and show people respectfully.

## Checklist for adult-literacy educators

Teaching

- [ ] Each explanation teaches what the exercise then asks for; nothing is assumed that has not been taught.
- [ ] Letter **sounds** and letter **names** are kept apart and labelled correctly; the model audio note says which one is wanted.
- [ ] Contrastive notes are right for this language (for example, in isiZulu "c" is a click, so the isiZulu explanation of "cat" says that English "c" makes /k/ here). Check every objective's contrastive tags.
- [ ] Feedback for each error type points to what went wrong (first, middle or last sound, letter shape, meaning, order) and is encouraging.
- [ ] Independent reading tasks really are independent: the target is not spoken before the learner answers, and the instruction does not give the answer away.
- [ ] Lessons are 3–7 minutes and ordered by prerequisites; Level 0 is a bridge into English, not a separate course.
- [ ] The placement activity is short, neutral and never framed as a test that can be failed.
- [ ] Real-world texts (SMS, signs, notices, forms) look and read like the real thing in South Africa.

Equivalence

- [ ] The isiZulu and Sesotho pathways teach the same English objectives with equivalent support. Note any place where one language needs a different explanation (that is expected) or where one pathway is weaker.

## Checklist for linguists

- [ ] Contrastive phonology tags (`content/linguistics/contrastive-tags.json`) are accurate for each language and each tagged objective, including which English vowels and consonant clusters are new.
- [ ] Phonetic notes for voice artists (for example "/æ/ as in cat, the pure sound, no added vowel") are correct and clear.
- [ ] Syllable and word examples in Level 0 use regular, familiar spellings.

## Checklist for AET specialists

Use `docs/aet-alignment.csv` (one row per proposed mapping) and record for each row whether the mapping is right, the correct AET level and the official reference. The product team updates `content/aet/outcomes.json` and regenerates the alignment document. Until then every report and certificate says "proposed mapping, not accredited".

## Audio (at `approved`)

- [ ] The recording says exactly the reviewed text, clearly, at a natural adult pace.
- [ ] English model audio uses a clear South African English accent, and letter sounds are pure sounds without added vowels.
- [ ] No clipping, noise, music or long silences; loudness consistent with other lines (the import normalises it).
- [ ] Recordings of English words inside isiZulu or Sesotho lines are pronounced as a speaker of that language naturally would.

See [audio-recording-guidelines.md](audio-recording-guidelines.md) for recording sessions.
