"use client";

import { lazy, Suspense, useEffect } from "react";
import { reportError } from "./analytics";
import { useRoute } from "./router";
import { LearnerProvider } from "./state";
import { Spinner } from "./ui/kit";
import { Start } from "./screens/Start";
import { SoundCheck } from "./screens/onboarding/SoundCheck";
import { LanguageSelect } from "./screens/onboarding/LanguageSelect";
import { Home } from "./screens/Home";

// Screens loaded on demand keep the first screen's JavaScript small. They are
// prefetched in idle time so the service worker caches them for offline use.
const load = {
  hello: () => import("./screens/onboarding/Hello"),
  demo: () => import("./screens/onboarding/Demo"),
  profile: () => import("./screens/onboarding/ProfileCreate"),
  save: () => import("./screens/onboarding/SaveChoice"),
  consent: () => import("./screens/onboarding/Consent"),
  level: () => import("./screens/onboarding/StartLevel"),
  assessment: () => import("./screens/Assessment"),
  path: () => import("./screens/Path"),
  lesson: () => import("./screens/LessonScreen"),
  done: () => import("./screens/LessonDone"),
  practice: () => import("./screens/Practice"),
  progress: () => import("./screens/ProgressScreen"),
  me: () => import("./screens/Me"),
  privacy: () => import("./screens/Privacy"),
  downloads: () => import("./screens/Downloads"),
  changeLevel: () => import("./screens/ChangeLevel"),
  join: () => import("./screens/Join"),
  profiles: () => import("./screens/ProfilePicker"),
  pin: () => import("./screens/PinEntry"),
  assist: () => import("./screens/Assist"),
};

const Hello = lazy(() => load.hello().then((m) => ({ default: m.Hello })));
const Demo = lazy(() => load.demo().then((m) => ({ default: m.Demo })));
const ProfileCreate = lazy(() => load.profile().then((m) => ({ default: m.ProfileCreate })));
const SaveChoice = lazy(() => load.save().then((m) => ({ default: m.SaveChoice })));
const Consent = lazy(() => load.consent().then((m) => ({ default: m.Consent })));
const StartLevel = lazy(() => load.level().then((m) => ({ default: m.StartLevel })));
const Assessment = lazy(() => load.assessment().then((m) => ({ default: m.Assessment })));
const Path = lazy(() => load.path().then((m) => ({ default: m.Path })));
const LessonScreen = lazy(() => load.lesson().then((m) => ({ default: m.LessonScreen })));
const LessonDone = lazy(() => load.done().then((m) => ({ default: m.LessonDone })));
const Practice = lazy(() => load.practice().then((m) => ({ default: m.Practice })));
const ProgressScreen = lazy(() => load.progress().then((m) => ({ default: m.ProgressScreen })));
const Me = lazy(() => load.me().then((m) => ({ default: m.Me })));
const Privacy = lazy(() => load.privacy().then((m) => ({ default: m.Privacy })));
const Downloads = lazy(() => load.downloads().then((m) => ({ default: m.Downloads })));
const ChangeLevel = lazy(() => load.changeLevel().then((m) => ({ default: m.ChangeLevel })));
const Join = lazy(() => load.join().then((m) => ({ default: m.Join })));
const ProfilePicker = lazy(() => load.profiles().then((m) => ({ default: m.ProfilePicker })));
const PinEntry = lazy(() => load.pin().then((m) => ({ default: m.PinEntry })));
const Assist = lazy(() => load.assist().then((m) => ({ default: m.Assist })));

function Routes() {
  const { parts } = useRoute();
  const [a, b, c] = parts;
  switch (a) {
    case undefined:
      return <Start />;
    case "welcome":
      return <SoundCheck />;
    case "language":
      return <LanguageSelect />;
    case "hello":
      return <Hello />;
    case "demo":
      return <Demo />;
    case "profile":
      return <ProfileCreate />;
    case "save":
      return <SaveChoice />;
    case "consent":
      return <Consent then={b} />;
    case "start-level":
      return <StartLevel />;
    case "assessment":
      return <Assessment kind={b === "retake" ? "retake" : "placement"} />;
    case "home":
      return <Home />;
    case "path":
      return <Path />;
    case "lesson":
      return c === "done" ? <LessonDone lessonId={b} /> : <LessonScreen key={b} lessonId={b} />;
    case "practice":
      return <Practice />;
    case "progress":
      return <ProgressScreen />;
    case "me":
      if (b === "privacy") return <Privacy />;
      if (b === "downloads") return <Downloads />;
      if (b === "level") return <ChangeLevel />;
      return <Me />;
    case "join":
      return <Join code={b} />;
    case "profiles":
      return <ProfilePicker />;
    case "pin":
      return <PinEntry profileId={b} />;
    case "assist":
      return <Assist profileId={b} />;
    default:
      return <Start />;
  }
}

function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV !== "true") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => reportError(`sw register: ${String(e)}`));
  }, []);
}

function useIdlePrefetch() {
  useEffect(() => {
    const run = () => {
      for (const f of Object.values(load)) f().catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 8000 }) : window.setTimeout(run, 4000);
    return () => {
      if (!w.requestIdleCallback) clearTimeout(t);
    };
  }, []);
}

function useErrorReporting() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.message || "error", { kind: "window" });
    const onRejection = (e: PromiseRejectionEvent) => reportError(String(e.reason ?? "rejection"), { kind: "promise" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

export function LearnerApp() {
  useServiceWorker();
  useIdlePrefetch();
  useErrorReporting();
  return (
    <LearnerProvider>
      <Suspense fallback={<Spinner />}>
        <Routes />
      </Suspense>
    </LearnerProvider>
  );
}
