"use client";

import { useEffect, useState } from "react";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconPlus, IconTeacher } from "../ui/icons";
import { Caption, ListenButton, Picture, Screen, Spinner } from "../ui/kit";
import { useSpeech } from "../ui/speech";
import { loadAppLines } from "../content";
import type { CompiledLine } from "@/lib/content/compiled";

/**
 * Shared phones: "who is learning now?" as a grid of each learner's picture.
 * Choosing a picture asks for that learner's secret PIN. A new learner can
 * be added from here.
 */
export function ProfilePicker() {
  const { profiles, ready, setLang } = useLearner();
  const { speak } = useSpeech();
  const [prompt, setPrompt] = useState<{ line: CompiledLine | null; lang: "zu" | "st" } | null>(null);

  // No profile is active yet: speak in the language of the most recently used profile.
  useEffect(() => {
    const recent = [...profiles].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
    if (!recent) return;
    loadAppLines(recent.language).then((l) => {
      const p = { line: l.lines["profiles.who"], lang: recent.language };
      setPrompt(p);
      void speak(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  useEffect(() => {
    if (ready && profiles.length === 0) navigate("/", { replace: true });
  }, [ready, profiles.length]);

  if (!ready) return <Spinner />;
  return (
    <Screen label="who is learning" className="gap-5 py-6">
      <div className="flex items-start gap-3">
        <ListenButton onListen={() => prompt && void speak(prompt)} />
        <Caption line={prompt?.line} always />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`profile-${p.avatarId}`}
            aria-label={p.nickname ?? p.avatarId.replace("avatar-", "")}
            onClick={() => navigate(`/pin/${p.id}`)}
            className="flex flex-col items-center gap-2 rounded-3xl border-4 border-line bg-white p-4 active:border-primary"
          >
            <Picture src={`/images/${p.avatarId}.svg`} className="h-28 w-28" />
            {p.nickname && <span className="text-lg font-bold">{p.nickname}</span>}
          </button>
        ))}
        <button
          type="button"
          data-testid="profile-add"
          aria-label="add a learner"
          onClick={() => {
            setLang(profiles[0]?.language ?? "zu");
            navigate("/language");
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl border-4 border-dashed border-line bg-white p-4 text-primary"
        >
          <IconPlus size={64} />
        </button>
      </div>
      <button
        type="button"
        data-testid="picker-assist"
        aria-label="teacher help"
        onClick={() => navigate("/assist")}
        className="mt-auto flex items-center justify-center gap-2 rounded-2xl p-3 text-ink-soft"
      >
        <IconTeacher size={28} />
      </button>
    </Screen>
  );
}
