"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompiledExercise, CompiledLex, CompiledLine, CompiledStep, Lang } from "@/lib/content/compiled";
import { CORE_CLIPS } from "@/lib/content/feedback";
import type { AttemptData, ErrorType } from "@/lib/learning/types";
import { useLearner } from "../state";
import { targetLexId } from "@/lib/tutor/tier1";
import { useTutorTiers } from "../tutor/TutorAsk";
import { IconCheck, IconContinue, IconRetry } from "../ui/icons";
import { Caption, ListenButton, Modal, ReviewMarker, SpeakButton, TopBar } from "../ui/kit";
import { useSpeech, type Speakable } from "../ui/speech";
import { LetterSoundEx, MinimalPairEx, PictureMatchEx } from "./exercises/Choice";
import { SentenceBuildEx, WordBuildEx } from "./exercises/Build";
import { ListeningEx, ReadingEx, RealWorldEx } from "./exercises/Comprehension";
import { ListenRepeat } from "./exercises/ListenRepeat";
import { TraceEx } from "./exercises/Trace";
import { TypingEx } from "./exercises/Typing";
import { HelpPanel } from "./HelpPanel";
import { TeachView } from "./TeachView";
import type { AnswerResult, ExercisePhase, ExerciseProps, PracticeProps } from "./types";

export interface PlayerItem {
  step: CompiledStep;
  lessonId: string;
  lex: Record<string, CompiledLex>;
}

export interface LessonResult {
  correct: number;
  total: number;
  durationMs: number;
  dataBytes?: number;
}

function isReadingTask(ex: CompiledExercise): boolean {
  return ex.evidence.some((e) => e.competency === "decode" && e.weight >= 1);
}

/** Network bytes fetched since `since` (Resource Timing), to report data use per lesson. */
function bytesSince(since: number): number | undefined {
  try {
    return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((e) => e.startTime >= since)
      .reduce((n, e) => n + (e.transferSize || 0), 0);
  } catch {
    return undefined;
  }
}

/**
 * Plays a lesson (or a revision session): teaching steps and exercises with
 * spoken instructions, immediate specific feedback, a second try, then the
 * answer shown. No time limits, no lives: mistakes are recorded for revision
 * and the learner always continues.
 */
export function LessonPlayer({
  items,
  lang,
  mode,
  startIndex = 0,
  intro,
  outro,
  review,
  onExit,
  onFinish,
}: {
  items: PlayerItem[];
  lang: Lang;
  mode: "lesson" | "revision";
  startIndex?: number;
  intro?: CompiledLine;
  outro?: CompiledLine;
  review?: Parameters<typeof ReviewMarker>[0]["status"];
  /** Called with the index of the step on screen (-1 for the introduction). */
  onExit: (stepIndex: number) => void;
  onFinish: (r: LessonResult) => void;
}) {
  const { clip, line, record } = useLearner();
  const { speak, stop } = useSpeech();
  const tiers = useTutorTiers(lang);
  const [index, setIndex] = useState(intro && startIndex === 0 ? -1 : Math.min(startIndex, items.length - 1));
  const [phase, setPhase] = useState<ExercisePhase>("answering");
  const [attempt, setAttempt] = useState(1);
  const [supported, setSupported] = useState(false);
  const [feedback, setFeedback] = useState<CompiledLine | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const results = useRef({ correct: 0, total: 0 });
  const [started] = useState(() => ({ at: Date.now(), perf: typeof performance !== "undefined" ? performance.now() : 0 }));
  const stepStarted = useRef(0);
  useEffect(() => {
    stepStarted.current = Date.now();
  }, []);
  // What "listen again" replays: registered by the step on screen, read only when tapped.
  const replay = useRef<() => void>(() => {});
  const setReplay = useCallback((fn: () => void) => {
    replay.current = fn;
  }, []);
  const replayCurrent = useCallback(() => replay.current(), []);

  const current = index >= 0 ? items[index] : null;
  const ex = current?.step.kind === "exercise" ? current.step : null;

  const finish = async () => {
    stop();
    if (outro) await speak({ line: outro, lang });
    onFinish({
      correct: results.current.correct,
      total: results.current.total,
      durationMs: Date.now() - started.at,
      dataBytes: bytesSince(started.perf),
    });
  };

  const goTo = async (next: number) => {
    stop();
    setPhase("answering");
    setAttempt(1);
    setSupported(false);
    setFeedback(null);
    stepStarted.current = Date.now();
    if (next >= items.length) {
      await finish();
      return;
    }
    if (mode === "lesson") await record("lesson_progress", { lessonId: items[next].lessonId, stepIndex: next });
    setIndex(next);
  };

  const recordAttempt = async (result: AnswerResult, outcome: AttemptData["outcome"], selfCheck?: AttemptData["selfCheck"]) => {
    if (!ex || !current) return;
    await record("attempt", {
      lessonId: current.lessonId,
      exerciseId: ex.id,
      exerciseType: ex.type,
      itemId: result.itemId ?? targetLexId(ex) ?? ex.id,
      objectiveIds: ex.objectives,
      evidence: ex.evidence,
      outcome,
      attemptNumber: attempt,
      supported,
      errorType: result.errorType,
      selfCheck,
      responseMs: Date.now() - stepStarted.current,
      revision: mode === "revision" || undefined,
    });
  };

  const onAnswer = async (r: AnswerResult) => {
    if (!ex || !current) return;
    await recordAttempt(r, r.correct ? "correct" : "incorrect");
    if (attempt === 1) {
      results.current.total += 1;
      if (r.correct) results.current.correct += 1;
    }
    const target = targetLexId(ex);
    const targetLex = target ? current.lex[target] : undefined;
    const reinforce: Speakable[] = targetLex && isReadingTask(ex) ? [{ audio: targetLex.audio, lang: targetLex.lang }] : [];
    if (r.correct) {
      const praise = clip(isReadingTask(ex) && !supported ? CORE_CLIPS.correctReading : CORE_CLIPS.correct[results.current.total % CORE_CLIPS.correct.length]);
      setFeedback(praise);
      setPhase("correct");
      await speak({ line: praise, lang }, ...reinforce);
      return;
    }
    if (attempt === 1) {
      const specific = ex.feedback[r.errorType as ErrorType] ?? clip("fb.wrong_choice");
      setFeedback(specific);
      setAttempt(2);
      setPhase("retry");
      stepStarted.current = Date.now();
      await speak({ line: clip(CORE_CLIPS.tryAgain), lang }, { line: specific, lang });
      return;
    }
    setFeedback(clip(CORE_CLIPS.showAnswer));
    setPhase("revealed");
    await speak(
      { line: clip(CORE_CLIPS.showAnswer), lang },
      ...(targetLex ? [{ audio: targetLex.audio, lang: targetLex.lang } as Speakable] : []),
      { line: clip(CORE_CLIPS.mistakesOk), lang },
    );
  };

  const onPractised = (itemId: string, selfCheck: "same" | "different" | "no_recording") => {
    void recordAttempt({ correct: true, itemId }, "practised", selfCheck);
  };

  const done = phase === "correct" || phase === "revealed";

  return (
    <main aria-label="lesson" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-4">
      <TopBar
        progress={Math.max(0, index) / items.length}
        onClose={() => {
          stop();
          setShowExit(true);
          void speak({ line: line("lesson.exit_confirm"), lang });
        }}
        onHelp={current ? () => setShowHelp(true) : undefined}
        onListen={() => (index === -1 ? void speak({ line: intro, lang }) : replayCurrent())}
      />

      {index === -1 && intro && (
        <IntroCard intro={intro} lang={lang} review={review} onStart={() => void goTo(0)} />
      )}

      {current?.step.kind === "teach" && (
        <div className="flex flex-1 flex-col gap-6">
          <TeachView step={current.step} lex={current.lex} lang={lang} setReplay={setReplay} />
          <SpeakButton testId="continue" speech={line("ui.continue")} onClick={() => void goTo(index + 1)} className="mt-auto w-full">
            <IconContinue size={36} />
          </SpeakButton>
        </div>
      )}

      {ex && current && (
        <div key={ex.id} className="flex flex-1 flex-col gap-4 pb-40" data-testid={`exercise-${ex.type}`} data-exercise-id={ex.id}>
          <Caption line={ex.instruction} />
          <ExerciseView
            ex={ex}
            lex={current.lex}
            lang={lang}
            phase={phase}
            onAnswer={onAnswer}
            setReplay={setReplay}
            onPractised={onPractised}
            onDone={async () => {
              await speak({ line: line("repeat.practised"), lang });
              void goTo(index + 1);
            }}
          />
          {phase === "retry" && feedback && (
            <div role="status" data-testid="feedback-retry" className="pop-in flex items-center gap-3 rounded-2xl border-2 border-retry bg-retry-soft p-3 text-retry">
              <IconRetry size={32} />
              <p className="flex-1 text-base font-semibold text-ink">{feedback.text}</p>
              <ListenButton size="sm" onListen={() => void speak({ line: feedback, lang })} />
            </div>
          )}
        </div>
      )}

      {done && feedback && (
        <div
          role="status"
          data-testid={phase === "correct" ? "feedback-correct" : "feedback-revealed"}
          className={`pop-in fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl flex-col gap-3 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] ${
            phase === "correct" ? "bg-good-soft" : "bg-primary-soft"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${phase === "correct" ? "bg-good" : "bg-primary"}`}>
              {phase === "correct" ? <IconCheck size={34} /> : <IconRetry size={30} />}
            </span>
            <p className="flex-1 text-lg font-bold">{feedback.text}</p>
            <ListenButton size="sm" onListen={() => void speak({ line: feedback, lang })} />
          </div>
          <SpeakButton testId="continue" variant={phase === "correct" ? "good" : "primary"} speech={line("ui.continue")} onClick={() => void goTo(index + 1)} className="w-full">
            <IconContinue size={36} />
          </SpeakButton>
        </div>
      )}

      {showHelp && current && (
        <HelpPanel
          step={current.step}
          lex={current.lex}
          lang={lang}
          lessonId={current.lessonId}
          instructionReplay={replayCurrent}
          spokenQuestions={tiers.spokenQuestions}
          onSupported={() => setSupported(true)}
          onClose={() => setShowHelp(false)}
        />
      )}

      {showExit && (
        <Modal label={line("lesson.exit_confirm")?.text ?? "stop lesson?"} onClose={() => setShowExit(false)}>
          <div className="flex flex-col gap-4">
            <Caption line={line("lesson.exit_confirm")} />
            <SpeakButton testId="keep-going" speech={line("lesson.keep_going")} onClick={() => setShowExit(false)} className="w-full">
              <IconContinue size={32} />
              <span>{line("lesson.keep_going")?.label}</span>
            </SpeakButton>
            <SpeakButton testId="stop-lesson" variant="secondary" speech={line("lesson.stop")} onClick={() => onExit(index)} className="w-full">
              <span>{line("lesson.stop")?.label}</span>
            </SpeakButton>
          </div>
        </Modal>
      )}
    </main>
  );
}

function IntroCard({ intro, lang, review, onStart }: { intro: CompiledLine; lang: Lang; review?: Parameters<typeof ReviewMarker>[0]["status"]; onStart: () => void }) {
  const { line } = useLearner();
  const { speak } = useSpeech();
  useEffect(() => {
    const t = setTimeout(() => void speak({ line: intro, lang }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro.id]);
  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="lesson-intro">
      <ReviewMarker status={review} />
      <div className="flex items-start gap-3">
        <ListenButton onListen={() => void speak({ line: intro, lang })} />
        <Caption line={intro} />
      </div>
      <SpeakButton testId="start-lesson" speech={line("ui.continue")} onClick={onStart} className="mt-auto w-full">
        <IconContinue size={36} />
      </SpeakButton>
    </div>
  );
}

/** The exercise component for the step's type. */
function ExerciseView(props: ExerciseProps & PracticeProps) {
  const { ex } = props;
  switch (ex.type) {
    case "listen_repeat":
      return <ListenRepeat {...props} ex={ex} />;
    case "letter_sound":
      return <LetterSoundEx {...props} ex={ex} />;
    case "picture_match":
      return <PictureMatchEx {...props} ex={ex} />;
    case "minimal_pair":
      return <MinimalPairEx {...props} ex={ex} />;
    case "word_build":
      return <WordBuildEx {...props} ex={ex} />;
    case "sentence_build":
      return <SentenceBuildEx {...props} ex={ex} />;
    case "listening_comprehension":
      return <ListeningEx {...props} ex={ex} />;
    case "reading_comprehension":
      return <ReadingEx {...props} ex={ex} />;
    case "real_world":
      return <RealWorldEx {...props} ex={ex} />;
    case "trace":
      return <TraceEx {...props} ex={ex} />;
    case "typing":
      return <TypingEx {...props} ex={ex} />;
  }
}
