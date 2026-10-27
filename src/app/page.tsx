import { LearnerApp } from "@/learner/LearnerApp";

/**
 * The learner experience: a single offline-capable page. Everything inside is
 * a client-side app with hash routes, cached by the service worker.
 */
export default function Page() {
  return <LearnerApp />;
}
