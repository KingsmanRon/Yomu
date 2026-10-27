"use client";

import { useEffect, useMemo, useState } from "react";
import { ASSESSMENT_INSTRUMENT_VERSION } from "@/config/app";
import type { CompiledAssessment } from "@/lib/content/compiled";
import { placementLevel } from "@/lib/learning/placement";
import type { AssessmentSection } from "@/lib/learning/types";
import { track } from "../analytics";
import { loadAssessment } from "../content";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconContinue } from "../ui/icons";
import { Caption, ListenButton, Picture, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeech } from "../ui/speech";

type Scores = Partial<Record<AssessmentSection, { correct: number; total: number }>>;

/**
 * Placement activity: short, audio-guided and skippable. There is no right or
 * wrong feedback, only a neutral "thank you" after each answer, and the
 * result is described as a starting point, never as a pass or fail.
 */
export function Assessment({ kind }: { kind: "placement" | "retake" }) {
  const { lang, line, profile, record, updateActive } = useLearner();
  const { speak } = useSpeech();
  const [data, setData] = useState<CompiledAssessment | null>(null);
  const [index, setIndex] = useState(-1);
  const [scores, setScores] = useState<Scores>({});
  const [locked, setLocked] = useState(false);
  // The first placement was already recorded (a reload during the result): go home.
  const [placedAtOpen, setPlacedAtOpen] = useState<boolean | null>(null);
  if (profile && placedAtOpen === null) setPlacedAtOpen(kind === "placement" && profile.onboarding.placementDone);
  useEffect(() => {
    if (placedAtOpen) navigate("/home", { replace: true });
  }, [placedAtOpen]);

  useEffect(() => {
    if (lang) loadAssessment(lang).then(setData).catch(() => navigate("/home"));
  }, [lang]);

  const item = data && index >= 0 ? data.items[index] : null;
  const target = item && data ? data.lex[item.target] : null;

  const playItem = useMemo(
    () => async () => {
      if (!item || !lang || !target) return;
      const items = [{ line: item.instruction, lang }] as Parameters<typeof speak>;
      if (item.format === "hear_choose_text") {
        items.push({ audio: item.useLetterName ? target.nameAudio : target.audio, lang: target.lang });
      }
      await speak(...items);
    },
    [item, lang, target, speak],
  );

  useEffect(() => {
    if (index === -1 && data && lang) void speak({ line: data.intro, lang });
    if (item) void playItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, data]);

  if (!lang || !profile) return null;
  if (!data) return <Spinner />;

  const finish = async (final: Scores, skipped: boolean) => {
    const level = placementLevel(final);
    await record("assessment", { kind, instrument: ASSESSMENT_INSTRUMENT_VERSION, skipped, scores: final, placedLevel: level });
    await updateActive({ onboarding: { completed: true, placementDone: true } });
    void track("assessment_complete", { kind, level, skipped }, profile.id);
    if (kind === "placement") void track("onboarding_complete", { skipped, level }, profile.id);
    await speak({ line: data.outro, lang }, { line: line(`place.level${level}`), lang }, { line: line("place.change_any_time"), lang });
    navigate("/home");
  };

  const answer = async (choice: string) => {
    if (!item || locked) return;
    setLocked(true);
    const s = scores[item.section as AssessmentSection] ?? { correct: 0, total: 0 };
    const next: Scores = { ...scores, [item.section]: { correct: s.correct + (choice === item.target ? 1 : 0), total: s.total + 1 } };
    setScores(next);
    await speak({ line: line("assess.thanks"), lang });
    setLocked(false);
    if (index + 1 >= data.items.length) await finish(next, false);
    else setIndex(index + 1);
  };

  if (index === -1) {
    return (
      <Screen label="placement activity" className="gap-6 py-6">
        <div className="flex items-start gap-3">
          <ListenButton onListen={() => void speak({ line: data.intro, lang })} />
          <Caption line={data.intro} />
        </div>
        <button
          type="button"
          data-testid="assessment-begin"
          aria-label={line("assess.start")?.label ?? "start"}
          onClick={() => setIndex(0)}
          className="mt-auto flex min-h-20 items-center justify-center rounded-2xl bg-primary text-white"
        >
          <IconContinue size={40} />
        </button>
      </Screen>
    );
  }

  return (
    <Screen label="placement activity" className="gap-5">
      <TopBar
        progress={index / data.items.length}
        onClose={() => void finish(scores, true)}
        onListen={() => void playItem()}
      />
      <Caption line={item?.instruction} />
      {item && target && item.format === "read_picture" && (
        <>
          <p data-testid="read-target" lang="en" className="reading-text rounded-2xl bg-white p-6 text-center text-4xl font-bold">
            {target.text}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {item.options.map((o) => (
              <button
                key={o}
                type="button"
                data-testid="assessment-option"
                aria-label={`picture ${item.options.indexOf(o) + 1}`}
                disabled={locked}
                onClick={() => void answer(o)}
                className="flex aspect-square items-center justify-center rounded-2xl border-4 border-line bg-white p-2 active:border-primary"
              >
                <Picture src={data.lex[o]?.image} className="h-full w-full" />
              </button>
            ))}
          </div>
        </>
      )}
      {item && target && item.format === "hear_choose_text" && (
        <div className="grid grid-cols-3 gap-3 pt-6">
          {item.options.map((o) => (
            <button
              key={o}
              type="button"
              data-testid="assessment-option"
              disabled={locked}
              onClick={() => void answer(o)}
              lang="en"
              className="reading-text flex min-h-28 items-center justify-center rounded-2xl border-4 border-line bg-white text-4xl font-bold active:border-primary"
            >
              {data.lex[o]?.text}
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}
