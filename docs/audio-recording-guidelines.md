# Audio recording guidelines

Recorded audio is how Yomu teaches: learners who cannot read hear every instruction, explanation and English word. No isiZulu or Sesotho text-to-speech voice has been verified, so every line must be recorded by people. Until a line is recorded the app plays a labelled placeholder tone (a different pair of tones per language, never speech, and never English speech standing in for isiZulu or Sesotho).

## What to record

The recording manifest lists every line, generated from the content by `npm run audio:manifest` (CI checks it is up to date):

| File | Contents |
|---|---|
| `content/audio/recording-manifest.zu.csv` | isiZulu: 397 lines, about 27 minutes of speech |
| `content/audio/recording-manifest.st.csv` | Sesotho (South Africa): 397 lines, about 28 minutes |
| `content/audio/recording-manifest.en.csv` | English (South Africa) model audio: 81 lines (letter sounds and names, words, sentences), about 2 minutes |
| `content/audio/recording-manifest.csv` | All of the above |

Columns:

| Column | Meaning |
|---|---|
| `asset_id` | The line's ID. The recorded file must be named exactly `<asset_id>.wav` |
| `language` | The language to speak |
| `text_to_record` | Exactly what to say |
| `context_note` | How to say it (for example "Letter SOUND for phonics, not the letter name") |
| `where_used` | Where the learner hears it |
| `kind` | Lesson line, tutor clip, interface line, model audio, … |
| `lesson_id` | The lesson, where there is one |
| `target_duration_s` | A rough length at a calm pace; a guide, not a limit |
| `review_status` | Record only lines a native speaker has reviewed (`native_speaker_reviewed` or later). All are `draft` today |
| `recorded` | `yes`, `no`, or `re-record: script changed` |
| `file_name` | The file name to use |

Open the CSVs in a spreadsheet; they are UTF-8 with a byte-order mark so Excel shows isiZulu and Sesotho characters correctly.

## Voice talent

- Native speakers of the language, from South Africa; for Sesotho, South African Sesotho speakers. One main voice per language keeps lessons consistent; a second voice can record a few dialogue lines.
- Warm, calm, respectful adult voices, the way a good adult educator speaks. Not a radio announcer, not a children's presenter.
- English model audio: a clear South African English speaker trained to produce pure letter sounds (/s/ as "sss", not "suh"; /t/ without an added vowel). Record letter names separately (the manifest says which is which).
- Each voice artist signs a release that grants the project the right to use, edit and distribute the recordings in the app, with credit as they prefer; record it in the licence manifest ([licences.md](licences.md)).

## Session set-up

- A quiet, soft-furnished room (cupboard of clothes, blankets on walls). No echo, fridge hum, traffic or air-conditioning.
- A decent USB or XLR microphone, about a hand-span from the mouth, slightly off-axis, with a pop filter. A phone in a quiet room is better than a good microphone in a noisy one.
- Record WAV (or FLAC), 48 kHz, 24-bit (16-bit acceptable), mono.
- Leave about half a second of silence before and after each line (the import trims it).
- Peaks around −6 dBFS, never clipping.
- A native-speaker director listens live and checks each line against the script. Re-take anything misread, rushed or unclear.

## How to speak

- Natural adult pace, slightly slower than conversation, with clear word endings.
- Say exactly the text. If a line sounds wrong or unnatural, do not improvise: note it and send it back for review (the review must match the recorded text).
- English words inside isiZulu or Sesotho lines are pronounced the way a speaker of that language naturally would; the target English model audio is recorded separately.
- Encouraging lines ("well done", "try again") are sincere and calm, never sing-song.

## Naming and importing

1. Name each file exactly `<asset_id>.wav`, for example `zu.l10-satp.intro.wav`. Sub-folders are fine; a file in a folder named after a different language is reported as mismatched.
2. Check before importing: `npm run audio:import -- --source ./recordings --dry-run`.
3. Import: `npm run audio:import -- --source ./recordings`. For each file the script:
   - trims leading and trailing silence,
   - normalises loudness to −18 LUFS integrated (true peak −1.5 dBTP, LRA 11; louder than broadcast, for phone speakers),
   - downmixes to mono,
   - encodes **Ogg Opus at 16 kbps** (speech-optimised, 48 kHz) and **AAC at 32 kbps** (24 kHz) for phones that cannot play Opus, into `public/audio/rec/<lang>/`,
   - records the file in `content/audio/recordings.json` with a hash of the script text it was recorded from.
4. The import reports lines still missing, files that match no line (unused), files in the wrong language folder (mismatched), duplicates and unreadable files; it exits with an error on mismatched, duplicate or invalid files.
5. `npm run audio:manifest` updates the `recorded` column; `npm run audio:import -- --report` shows coverage at any time.

If a script changes after recording, the text hash no longer matches: the old recording stops being used, the line falls back to its placeholder, and the manifest says `re-record: script changed`.

At 16 kbps a five-second line is about 10 KB, so a whole lesson with its audio and pictures stays far below the 2 MB budget (the largest lesson is about 290 KB with placeholders).

## After recording

A reviewer listens to each recording in the staff review tool (`/staff/review`) and approves the line only when text and audio are both right ([content-review-checklist.md](content-review-checklist.md)). The amber "unreviewed content" marker disappears once every line of a lesson is approved.
