# Learning engine

How progress is calculated: evidence, mastery, XP, streaks, revision, the learning path and placement. The rules live in `src/lib/learning/` as pure functions. The phone runs them offline on its activity log and the server runs the same code on the synced log, so both always agree (the server's result is the one stored).

## The activity log

Everything the learner does is an operation (`src/lib/learning/types.ts`) appended to a log on the phone:

| Operation | Recorded when |
|---|---|
| `attempt` | An exercise is answered: outcome (`correct`, `incorrect` or `practised`), attempt number, whether help revealed the answer first (`supported`), error type, the evidence it provides |
| `lesson_complete` | A lesson is finished: score, duration, data used while it was open |
| `lesson_progress` | The learner moves to the next step (for resuming) |
| `assessment` | The placement activity or a retake: section scores and the level it suggests |
| `level_change` | The learner (or a facilitator) changes level |

Each operation has a UUID made on the phone, which is also its idempotency key: syncing the same operation twice stores it once. All progress (XP included) is recalculated from the whole log every time, never added up from stored totals, so merging two phones' logs or replaying a sync cannot double-count. Order is by the phone's timestamp, then by ID.

## Evidence: what each exercise proves

Each lesson component declares what its result is evidence of (`src/lib/learning/evidence.ts`). The mastery engine counts a result only towards those competencies.

| Component | Evidence |
|---|---|
| Listen and repeat | `repeat` only, always recorded as *practised*. Saying a word after a model is never reading. |
| Hear a sound, choose the letter; hear a word, find the sound in it | `recognise` |
| See a letter with no audio, choose its sound | `decode` (full weight) |
| See a written word with no audio, choose the picture | `decode` and `understand_written` (full weight) |
| See a picture, choose its written word | `decode` (full weight) |
| Hear a word, choose the picture | `understand_spoken` |
| Build a word or sentence from tiles | `write` (full) and `decode` (half weight) |
| Listening comprehension | `understand_spoken` |
| Reading comprehension; real-world reading (SMS, sign, notice, form) | `decode` and `understand_written` (full weight) |
| Tracing; typing | `write` |
| Minimal pairs (same or different, which word) | `recognise` |

Two rules protect the meaning of "can read":

- **Only first attempts count.** A retry after feedback was helped by that feedback.
- **Help that reveals the answer makes the attempt "supported".** If the learner asks to hear the word, its first sound or its meaning in a task that measures independent reading, the tutor says so first (clip `tutor.read_alone_first`), and the attempt then cannot count as `decode` or `understand_written` evidence.

## Mastery

For each learning objective the engine keeps, per competency, the chronological list of counted evidence (`src/lib/learning/mastery.ts`). A competency is *satisfied* when, over its last **5** events:

- weighted correct answers are at least **3**,
- weighted accuracy is at least **75%**,
- the correct answers cover at least **2** different items (or all items, if fewer were seen), and
- for `decode` only: at least **2** of the correct answers are full-weight (independent reading). Half-weight evidence such as building a word from tiles after hearing it can support decoding mastery but never produce it alone.

`repeat` is never mastered; it is reported as *practised*.

An objective is **mastered** when every competency it requires (declared in the lesson file) is satisfied. Statuses: `not_started`, `practised` (only listen-and-repeat so far), `developing`, `mastered`, and `needs_review` (was mastered, recent evidence has fallen below the bar). The first date an objective was mastered is kept: it is what completion evidence and badges use.

The unit tests (`tests/unit/mastery.test.ts`) prove that repeat-only or recognition-only evidence, however much of it, never results in decoding mastery.

## XP

XP is personal motivation only. It never unlocks or blocks anything, and there is no public ranking (`src/lib/learning/xp.ts`).

| Activity | XP |
|---|---|
| Correct on the first try | 2 |
| Correct after a retry | 1 |
| Listen-and-repeat practice | 1 |
| Finishing a lesson for the first time | 10 |
| Finishing it again on a later day (at most once per lesson per day) | 5 |
| Mastering an objective | 20 |

## Streaks

Forgiving by design (`src/lib/learning/streak.ts`):

- A local calendar day counts when the learner finishes a lesson or answers at least 5 exercises (a short revision session counts). The phone's local date is used, so offline learning counts on the day it happened once it syncs.
- Learners start with **2** grace days and earn one more every **7** active days, holding at most **3**.
- A missed day is covered automatically by a grace day when one is left. Only when none is left does the streak start again.
- Today never breaks a streak: the day is not over.
- Losing a streak never blocks anything.

## Revision (spaced repetition)

A Leitner system with five boxes (`src/lib/learning/revision.ts`). Every exercise with a right answer becomes a card the first time it is attempted.

| Box | Next review |
|---|---|
| 1 | the same day |
| 2 | 1 day later |
| 3 | 3 days later |
| 4 | 7 days later |
| 5 | 14 days later |

- A wrong first attempt sends the card to box 1, due today, so a missed exercise can be revised straight away.
- A correct, independent first attempt moves it up one box. A correct answer given with help does not move it.
- Retries after feedback do not move cards.

Due cards are ordered by priority, highest first: **+4** if the card's last failure was in an independent decoding task, **+3** for a fresh mistake (box 1), **+1** per day overdue, **+1** if an objective it belongs to is not mastered, **+0.5** per earlier lapse. A practice session takes the top 8. This weights revision towards objectives with failed decoding evidence, as the curriculum design asks.

## Learning path

(`src/lib/learning/path.ts`)

- Lessons are ordered by level, unit and order within the unit (the curriculum's prerequisite order).
- A lesson is open when it is at or below the learner's level, or when the lesson before it is completed. Finishing a lesson always opens the next one, however many mistakes were made: mistakes go to revision; they never block.
- The suggested next lesson is the unfinished lesson the learner left, otherwise the first open lesson at or above their level.
- Learners can change their level at any time (Me > change level).

## Placement

The placement activity (`content/assessment/placement.json`, instrument `placement-v1`) is short, audio-guided and skippable, with no right-or-wrong feedback. A section is *secure* at two thirds or better (`src/lib/learning/placement.ts`):

| Result | Starting level |
|---|---|
| Home-language decoding **and** English letter sounds not secure | 0: home-language reading bridge |
| English letter names or letter sounds not secure | 1 |
| Sight words not secure, or reading new words below half | 2 |
| Any sentence not read | 3 |
| Otherwise | 4 |

A learner who skips the activity answers one spoken question ("can you read your own language?"): yes starts at Level 1, not yet at Level 0. The result is a starting suggestion, never a judgement. The learner can retake the activity (Me > retake the placement activity) or change level at any time; a retake is also the post-assessment for pilots ([pilot-measurement-plan.md](pilot-measurement-plan.md)).

## Badges

Badges (`content/badges.json`) mostly reward literacy achievements, each tied to a mastered objective: reading a first home-language word, knowing the first English letter sounds, writing the first letters, reading a first English word alone, the little sight words, a first English sentence, an SMS, typing a reply, common signs, a notice. Three reward steady practice (first lesson, five lessons, 3- and 7-day streaks). They are earned from the same derived state, dated by the operation that earned them.

## Sync and conflicts

- The phone sends operations it has not synced (with the learner's own session), the server stores them idempotently, re-derives everything from the learner's complete log and returns operations from the learner's other phones. Every phone converges on the same log.
- A recalculation from a smaller log (an older, concurrent request) never overwrites a newer one (`ops_watermark`).
- Device timestamps are checked (no more than a day in the future, not before 2025) and every payload is validated (`src/server/ops.ts`).
- A learner is active on one phone at a time: moving to a new phone with a facilitator revokes the old phone's session, and the old phone can remove its local copy.
