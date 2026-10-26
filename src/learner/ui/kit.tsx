"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SHOW_REVIEW_MARKERS } from "@/config/app";
import type { CompiledLine, ReviewStatus } from "@/lib/content/compiled";
import { navigate } from "../router";
import { useLearner } from "../state";
import { useConnection } from "../offline/network";
import {
  IconBack,
  IconClose,
  IconFlame,
  IconHelp,
  IconListen,
  IconMe,
  IconMobileData,
  IconOffline,
  IconPath,
  IconPractice,
  IconProgress,
  IconStar,
  IconTone,
  IconWarning,
  IconWifi,
} from "./icons";
import { usePlaying, useSpeech } from "./speech";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <main aria-label={label} className={`mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-6 ${className}`}>
      {children}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Speakable buttons                                                   */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "good" | "danger" | "ghost" | "accent";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-[0_4px_0_0_var(--color-primary-dark)] active:translate-y-[2px] active:shadow-none",
  secondary: "bg-white text-ink border-2 border-line shadow-[0_3px_0_0_var(--color-line)] active:translate-y-[2px] active:shadow-none",
  good: "bg-good text-white shadow-[0_4px_0_0_#14532d] active:translate-y-[2px] active:shadow-none",
  danger: "bg-danger text-white shadow-[0_4px_0_0_#7f1d1d] active:translate-y-[2px] active:shadow-none",
  accent: "bg-accent text-white shadow-[0_4px_0_0_#78350f] active:translate-y-[2px] active:shadow-none",
  ghost: "bg-transparent text-ink",
};

/**
 * A large button. Pressing and holding it for half a second speaks its name
 * (the `speech` line) instead of activating it, so any button can be
 * explored without reading.
 */
export function SpeakButton({
  children,
  onClick,
  speech,
  variant = "primary",
  className = "",
  disabled,
  label,
  testId,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  speech?: CompiledLine | null;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  /** Accessible name. Defaults to the spoken line's written label or text. */
  label?: string;
  testId?: string;
  type?: "button" | "submit";
}) {
  const { lang } = useLearner();
  const { speak } = useSpeech();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const start = () => {
    held.current = false;
    if (!speech || !lang) return;
    timer.current = setTimeout(() => {
      held.current = true;
      void speak({ line: speech, lang });
    }, 500);
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type={type}
      data-testid={testId}
      aria-label={label ?? speech?.label ?? speech?.text}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onClick?.();
      }}
      className={`flex min-h-14 select-none items-center justify-center gap-3 rounded-2xl px-5 py-3 text-lg font-bold transition disabled:opacity-40 ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Round "listen again" control: the same icon everywhere. */
export function ListenButton({
  onListen,
  size = "md",
  label = "listen again",
  testId = "listen-again",
  slow,
}: {
  onListen: () => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  testId?: string;
  slow?: boolean;
}) {
  const dim = size === "lg" ? "h-24 w-24" : size === "sm" ? "h-12 w-12" : "h-16 w-16";
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onListen}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full ${slow ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary"} active:scale-95`}
    >
      <IconListen size={size === "lg" ? 48 : size === "sm" ? 24 : 32} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Captions and markers                                                */
/* ------------------------------------------------------------------ */

/**
 * Written form of a spoken line, in the teaching language, shown under the
 * audio (setting "captions"). Placeholder audio is labelled as such.
 */
export function Caption({ line, className = "", always }: { line: CompiledLine | null | undefined; className?: string; always?: boolean }) {
  const { profile } = useLearner();
  const playing = usePlaying();
  if (!line) return null;
  const show = always || (profile?.settings.captions ?? true);
  const active = playing === line.id;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {show && (
        <p data-testid="caption" className={`text-lg leading-snug ${active ? "text-ink" : "text-ink-soft"}`}>
          {line.text}
        </p>
      )}
      <AudioNotice line={line} />
    </div>
  );
}

export function AudioNotice({ line }: { line: CompiledLine | null | undefined }) {
  if (!line) return null;
  if (!line.audio)
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-soft">
        <IconWarning size={14} /> no recording yet
      </span>
    );
  if (line.audio.placeholder)
    return (
      <span
        data-testid="placeholder-audio"
        title="Placeholder tone: this line has not been recorded yet"
        className="inline-flex w-fit items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
      >
        <IconTone size={14} /> placeholder audio
      </span>
    );
  return null;
}

export function ReviewMarker({ status }: { status: ReviewStatus | undefined }) {
  if (!SHOW_REVIEW_MARKERS || !status || status === "approved") return null;
  return (
    <span
      data-testid="review-marker"
      title={`Content status: ${status}. Requires native-speaker and adult-literacy educator review before real-world use.`}
      className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-xs font-semibold text-accent"
    >
      <IconWarning size={14} /> unreviewed
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Top and bottom bars                                                 */
/* ------------------------------------------------------------------ */

/** Shows whether the app is offline, on Wi-Fi, or using mobile data. */
export function NetworkBadge() {
  const kind = useConnection();
  const { line, lang } = useLearner();
  const { speak } = useSpeech();
  const map = {
    offline: { icon: <IconOffline size={20} />, id: "net.offline", cls: "bg-line text-ink" },
    wifi: { icon: <IconWifi size={20} />, id: "net.wifi", cls: "bg-primary-soft text-primary" },
    mobile: { icon: <IconMobileData size={20} />, id: "net.mobile", cls: "bg-accent-soft text-accent" },
    unknown: { icon: <IconWifi size={20} />, id: "net.wifi", cls: "bg-primary-soft text-primary" },
  } as const;
  const m = map[kind];
  const l = line(m.id);
  return (
    <button
      type="button"
      data-testid={`network-${kind}`}
      aria-label={l?.label ?? kind}
      onClick={() => lang && l && void speak({ line: l, lang })}
      className={`flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold ${m.cls}`}
    >
      {m.icon}
      <span className="sr-only sm:not-sr-only">{l?.label}</span>
    </button>
  );
}

export function TopBar({
  onListen,
  onHelp,
  onClose,
  onBack,
  progress,
  showStats,
}: {
  onListen?: () => void;
  onHelp?: () => void;
  onClose?: () => void;
  onBack?: () => void;
  /** 0..1 for lessons. */
  progress?: number;
  showStats?: boolean;
}) {
  const { derived, line } = useLearner();
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 bg-paper/95 px-4 py-2 backdrop-blur">
      {onClose && (
        <button type="button" data-testid="close" aria-label={line("ui.close")?.label ?? "close"} onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-full text-ink-soft">
          <IconClose />
        </button>
      )}
      {onBack && (
        <button type="button" data-testid="back" aria-label={line("ui.back")?.label ?? "back"} onClick={onBack} className="flex h-12 w-12 items-center justify-center rounded-full text-ink-soft">
          <IconBack />
        </button>
      )}
      {progress !== undefined && (
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-good transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {showStats && derived && (
        <div className="flex flex-1 items-center gap-3 text-lg font-bold">
          <span className="flex items-center gap-1 text-accent" data-testid="streak">
            <IconFlame size={24} />
            {derived.streak.current}
          </span>
          <span className="flex items-center gap-1 text-ochre" data-testid="xp">
            <IconStar size={24} className="text-[#D97706]" />
            {derived.xp}
          </span>
        </div>
      )}
      {progress === undefined && !showStats && <div className="flex-1" />}
      <NetworkBadge />
      {onHelp && (
        <button type="button" data-testid="help" aria-label={line("ui.help")?.label ?? "help"} onClick={onHelp} className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconHelp />
        </button>
      )}
      {onListen && <ListenButton size="sm" onListen={onListen} label={line("ui.listen_again")?.label ?? "listen again"} />}
    </header>
  );
}

export function BottomNav({ active }: { active: "learn" | "practice" | "progress" | "me" }) {
  const { line, lang } = useLearner();
  const { speak } = useSpeech();
  const items = [
    { key: "learn", path: "/path", icon: <IconPath />, id: "nav.learn" },
    { key: "practice", path: "/practice", icon: <IconPractice />, id: "nav.practice" },
    { key: "progress", path: "/progress", icon: <IconProgress />, id: "nav.progress" },
    { key: "me", path: "/me", icon: <IconMe />, id: "nav.me" },
  ] as const;
  return (
    <nav className="sticky bottom-0 z-20 -mx-4 mt-auto grid grid-cols-4 border-t-2 border-line bg-white pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const l = line(it.id);
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            data-testid={`nav-${it.key}`}
            aria-current={on ? "page" : undefined}
            aria-label={l?.label ?? it.key}
            onClick={() => {
              if (lang && l) void speak({ line: l, lang });
              navigate(it.path);
            }}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold ${on ? "text-primary" : "text-ink-soft"}`}
          >
            {it.icon}
            <span>{l?.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Picture({ src, className = "", alt = "" }: { src: string | undefined; className?: string; alt?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`pointer-events-none select-none ${className}`} draggable={false} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" aria-label={label ?? "loading"} className="flex items-center justify-center p-8">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-line border-t-primary" />
    </div>
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl outline-none sm:rounded-3xl"
      >
        {children}
      </div>
    </div>
  );
}

/** A big press-and-hold confirmation, for destructive actions (no reading needed). */
export function HoldButton({ onConfirm, speech, ms = 2000, children, testId }: { onConfirm: () => void; speech?: CompiledLine | null; ms?: number; children: ReactNode; testId?: string }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const started = useRef<number>(0);
  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };
  const tick = (now: number) => {
    const p = Math.min(1, (now - started.current) / ms);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm();
    } else raf.current = requestAnimationFrame(tick);
  };
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={speech?.label ?? "hold to confirm"}
      onPointerDown={(e) => {
        started.current = e.timeStamp;
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onConfirm();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="relative flex min-h-16 w-full select-none items-center justify-center gap-3 overflow-hidden rounded-2xl bg-danger px-5 text-lg font-bold text-white"
    >
      <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${progress * 100}%` }} aria-hidden="true" />
      <span className="relative flex items-center gap-3">{children}</span>
    </button>
  );
}

export function useOnceFlag(): [boolean, () => void] {
  const [v, setV] = useState(false);
  return [v, () => setV(true)];
}
