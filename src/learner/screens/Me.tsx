"use client";

import { LANGUAGE_CONFIG, TEACHING_LANGUAGES, backendConfigured } from "@/config/app";
import { api } from "../offline/api";
import { navigate } from "../router";
import { useLearner } from "../state";
import {
  IconCaptions,
  IconCloud,
  IconDownload,
  IconGroup,
  IconLanguage,
  IconLevel,
  IconLock,
  IconRetry,
  IconShield,
  IconTeacher,
  IconText,
  IconWarning,
  IconWifi,
} from "../ui/icons";
import { BottomNav, Caption, Picture, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeakOnMount, useSpeech } from "../ui/speech";

/** Profile and preferences. Every row speaks its name when pressed and held, and when tapped. */
export function Me() {
  const { lang, line, profile, profiles, updateActive, lock } = useLearner();
  const { speak } = useSpeech();
  useSpeakOnMount(lang ? [{ line: line("me.intro"), lang }] : null, [lang]);
  if (!lang || !profile) return <Spinner />;

  const row = (id: string, icon: React.ReactNode, onClick: () => void, testId: string, right?: React.ReactNode) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => {
        void speak({ line: line(id), lang });
        onClick();
      }}
      className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-white px-4 text-left"
    >
      <span className="text-primary">{icon}</span>
      <span className="flex-1 text-lg font-semibold">{line(id)?.label}</span>
      {right}
    </button>
  );
  const toggle = (on: boolean) => (
    <span aria-hidden="true" className={`flex h-8 w-14 items-center rounded-full p-1 ${on ? "justify-end bg-good" : "justify-start bg-line"}`}>
      <span className="h-6 w-6 rounded-full bg-white" />
    </span>
  );
  const s = profile.settings;

  return (
    <Screen label="me">
      <TopBar onListen={() => void speak({ line: line("me.intro"), lang })} />
      <div className="mb-4 flex items-center gap-4">
        <Picture src={`/images/${profile.avatarId}.svg`} className="h-20 w-20" />
        <div className="flex flex-col">
          <span className="text-xl font-bold">{profile.nickname ?? LANGUAGE_CONFIG[lang].nativeName}</span>
          {profile.learnerId && !profile.sessionLost ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-good">
              <IconCloud size={18} /> online
            </span>
          ) : (
            <span className="text-sm text-ink-soft">phone only</span>
          )}
        </div>
      </div>
      {profile.sessionLost && (
        <button
          type="button"
          data-testid="me-moved-phone"
          onClick={() => {
            void speak({ line: line("me.moved_phone"), lang });
            navigate("/me/privacy");
          }}
          className="mb-4 flex items-start gap-3 rounded-3xl border-2 border-accent bg-accent-soft p-4 text-left"
        >
          <IconWarning size={28} className="shrink-0 text-accent" />
          <Caption line={line("me.moved_phone")} />
        </button>
      )}
      <Caption line={line("me.intro")} />

      <div className="mt-4 flex flex-col gap-3 pb-6">
        {row(
          "me.text_size",
          <IconText />,
          () => void updateActive({ settings: { ...s, textScale: s.textScale === 1 ? 1.15 : s.textScale === 1.15 ? 1.3 : 1 } }),
          "setting-text-size",
          <span className="text-lg font-bold">{s.textScale === 1 ? "A" : s.textScale === 1.15 ? "A+" : "A++"}</span>,
        )}
        {row("me.captions", <IconCaptions />, () => void updateActive({ settings: { ...s, captions: !s.captions } }), "setting-captions", toggle(s.captions))}
        {row("me.wifi_only", <IconWifi />, () => void updateActive({ settings: { ...s, wifiOnly: !s.wifiOnly } }), "setting-wifi-only", toggle(s.wifiOnly))}
        {row(
          "me.language",
          <IconLanguage />,
          async () => {
            const next = TEACHING_LANGUAGES.find((l) => l !== lang)!;
            await updateActive({ language: next });
            if (profile.learnerId) void api(profile.id, "/api/learner/me", { method: "PATCH", body: { teachingLanguage: next } }).catch(() => {});
          },
          "setting-language",
          <span className="font-bold">{LANGUAGE_CONFIG[lang].nativeName}</span>,
        )}
        {row("me.level", <IconLevel />, () => navigate("/me/level"), "me-level")}
        {row("me.retake", <IconRetry />, () => navigate("/assessment/retake"), "me-retake")}
        {row("me.downloads", <IconDownload />, () => navigate("/me/downloads"), "me-downloads")}
        {!profile.learnerId && backendConfigured() && row("save.online", <IconCloud />, () => navigate("/consent"), "me-save-online")}
        {row("join.intro", <IconGroup />, () => navigate("/join"), "me-join")}
        {row("me.sharing", <IconShield />, () => navigate("/me/privacy"), "me-privacy")}
        {row("me.facilitator", <IconTeacher />, () => navigate("/assist"), "me-assist")}
        {(profiles.length > 1 || profile.pin) &&
          row(
            "profiles.switch",
            <IconLock />,
            () => {
              // The session stays on the phone (an anonymous account cannot be
              // signed back into without it); the PIN guards the profile.
              lock();
              navigate("/profiles");
            },
            "me-switch",
          )}
      </div>
      <BottomNav active="me" />
    </Screen>
  );
}

