"use client";

import { useEffect, useRef, useState } from "react";
import { CONSENT_VERSION } from "@/config/app";
import { track } from "../analytics";
import { parseJoinCode } from "../joinCode";
import { api, ApiError } from "../offline/api";
import { useOnline } from "../offline/network";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconBackspace, IconCheck, IconClose, IconCloud, IconGroup, IconQr } from "../ui/icons";
import { Caption, ListenButton, Screen, SpeakButton, Spinner, TopBar } from "../ui/kit";
import { useSpeech } from "../ui/speech";

type Share = { mastery: boolean; mistakes: boolean; tutorLogs: boolean };

/**
 * Join a class with the code the facilitator shows (typed on big number
 * keys, or scanned as a QR code), then choose what to share, by voice.
 */
export function Join({ code: initial }: { code?: string }) {
  const { lang, line, profile } = useLearner();
  const { speak } = useSpeech();
  const online = useOnline();
  const [code, setCode] = useState(initial && /^\d{6}$/.test(initial) ? initial : "");
  const [phase, setPhase] = useState<"code" | "scan" | "share" | "saving" | "done">(initial && /^\d{6}$/.test(initial) ? "share" : "code");
  const [share, setShare] = useState<Share>({ mastery: false, mistakes: false, tutorLogs: false });
  const [className, setClassName] = useState("");
  const scanSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!lang) return;
    if (!profile?.learnerId) void speak({ line: line("join.need_account"), lang });
    else if (phase === "code") void speak({ line: line("join.intro"), lang });
    else if (phase === "share") void speak({ line: line("share.intro"), lang }, { line: line("share.basic"), lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lang, profile?.learnerId]);

  if (!lang || !profile) return <Spinner />;

  if (!profile.learnerId)
    return (
      <Screen label="join a class">
        <TopBar onBack={() => navigate("/me")} onListen={() => void speak({ line: line("join.need_account"), lang })} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <IconGroup size={96} className="text-primary" />
          <Caption line={line("join.need_account")} className="items-center" />
          <SpeakButton testId="join-save-online" speech={line("save.online")} onClick={() => navigate("/consent/join")} className="w-full" disabled={!online}>
            <IconCloud size={32} />
            <span>{line("save.online")?.label}</span>
          </SpeakButton>
        </div>
      </Screen>
    );

  const submit = async () => {
    setPhase("saving");
    try {
      const r = await api<{ name: string }>(profile.id, "/api/learner/cohort/join", {
        body: { code, share, consentVersion: CONSENT_VERSION, language: lang },
      });
      setClassName(r.name);
      void track("cohort_join", {}, profile.id);
      setPhase("done");
      await speak({ line: line("join.done"), lang });
    } catch (e) {
      const notFound = e instanceof ApiError && e.code === "cohort_not_found";
      await speak({ line: line(notFound ? "join.bad_code" : e instanceof ApiError && e.status === 0 ? "delete.offline" : "sys.error_generic"), lang });
      setCode("");
      setPhase("code");
    }
  };

  if (phase === "saving") return <Spinner />;

  if (phase === "done")
    return (
      <Screen label="joined" className="items-center justify-center gap-6 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-good text-white">
          <IconCheck size={64} />
        </span>
        <p className="text-2xl font-bold" data-testid="joined-class">
          {className}
        </p>
        <Caption line={line("join.done")} className="items-center" />
        <SpeakButton testId="continue" speech={line("ui.continue")} onClick={() => navigate("/home")} className="w-full">
          <IconCheck size={32} />
        </SpeakButton>
      </Screen>
    );

  if (phase === "scan") return <Scanner onCode={(c) => { setCode(c); setPhase("share"); }} onCancel={() => setPhase("code")} />;

  if (phase === "share") {
    const question = (key: keyof Share, id: string) => (
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-3" key={key}>
        <div className="flex items-start gap-3">
          <ListenButton size="sm" onListen={() => void speak({ line: line(id), lang })} />
          <Caption line={line(id)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid={`share-${key}-no`}
            aria-pressed={!share[key]}
            onClick={() => setShare({ ...share, [key]: false })}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-4 text-lg font-bold ${!share[key] ? "border-ink bg-line" : "border-line bg-white"}`}
          >
            <IconClose size={24} /> {line("share.no")?.label}
          </button>
          <button
            type="button"
            data-testid={`share-${key}-yes`}
            aria-pressed={share[key]}
            onClick={() => setShare({ ...share, [key]: true })}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-4 text-lg font-bold ${share[key] ? "border-good bg-good-soft" : "border-line bg-white"}`}
          >
            <IconCheck size={24} /> {line("share.yes")?.label}
          </button>
        </div>
      </div>
    );
    return (
      <Screen label="what your class can see">
        <TopBar onBack={() => setPhase("code")} onListen={() => void speak({ line: line("share.intro"), lang }, { line: line("share.basic"), lang })} />
        <div className="flex flex-col gap-3 pb-4">
          <Caption line={line("share.intro")} />
          <div className="rounded-2xl bg-primary-soft p-3">
            <Caption line={line("share.basic")} always />
          </div>
          {question("mastery", "share.mastery")}
          {question("mistakes", "share.mistakes")}
          {question("tutorLogs", "share.tutor")}
          <SpeakButton testId="join-confirm" speech={line("share.confirm")} onClick={() => void submit()} className="w-full" disabled={!online}>
            <IconGroup size={32} />
            <span>{line("share.confirm")?.label}</span>
          </SpeakButton>
        </div>
      </Screen>
    );
  }

  return (
    <Screen label="join a class">
      <TopBar onBack={() => navigate("/me")} onListen={() => void speak({ line: line("join.intro"), lang })} />
      <Caption line={line("join.intro")} />
      <div className="my-4 flex justify-center gap-2" data-testid="code-display" aria-label={`code ${code}`}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex h-14 w-11 items-center justify-center rounded-xl border-4 border-line bg-white text-3xl font-bold">
            {code[i] ?? ""}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" data-testid={`digit-${d}`} disabled={code.length >= 6} onClick={() => setCode(code + d)} className="min-h-16 rounded-2xl border-2 border-line bg-white text-3xl font-bold active:bg-primary-soft">
            {d}
          </button>
        ))}
        {scanSupported ? (
          <button type="button" data-testid="scan-qr" aria-label={line("join.scan")?.label ?? "scan"} onClick={() => setPhase("scan")} className="flex min-h-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <IconQr size={36} />
          </button>
        ) : (
          <span />
        )}
        <button type="button" data-testid="digit-0" disabled={code.length >= 6} onClick={() => setCode(code + "0")} className="min-h-16 rounded-2xl border-2 border-line bg-white text-3xl font-bold">
          0
        </button>
        <button type="button" data-testid="digit-back" aria-label="remove last" onClick={() => setCode(code.slice(0, -1))} className="flex min-h-16 items-center justify-center rounded-2xl text-ink-soft">
          <IconBackspace size={32} />
        </button>
      </div>
      <SpeakButton testId="code-continue" speech={line("ui.continue")} disabled={code.length !== 6 || !online} onClick={() => setPhase("share")} className="mt-4 w-full">
        <IconCheck size={32} />
      </SpeakButton>
    </Screen>
  );
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** In-app QR scanning with the browser's built-in detector (no extra download). */
function Scanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const { lang, line } = useLearner();
  const { speak } = useSpeech();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    if (lang) void speak({ line: line("join.scan"), lang });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        while (!stopped) {
          const codes = await detector.detect(video.current);
          const found = codes.map((c) => parseJoinCode(c.rawValue)).find(Boolean);
          if (found) {
            onCode(found);
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        onCancel();
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Screen label="scan class code" className="gap-4 py-4">
      <video ref={video} muted playsInline className="aspect-square w-full rounded-3xl bg-black object-cover" />
      <Caption line={line("join.scan")} />
      <button type="button" data-testid="scan-cancel" onClick={onCancel} className="min-h-14 rounded-2xl border-2 border-line bg-white text-lg font-bold">
        <IconClose size={28} className="mx-auto" />
      </button>
    </Screen>
  );
}
