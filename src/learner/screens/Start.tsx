"use client";

import { useEffect } from "react";
import { getMeta } from "../offline/db";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconOffline, IconRetry } from "../ui/icons";
import { Screen, Spinner } from "../ui/kit";

/**
 * Decides where the app opens:
 *  - first launch: sound check, then language selection;
 *  - one learner on this phone: straight in (no picker, no PIN);
 *  - several learners: the picture-based profile picker.
 */
export function Start() {
  const { ready, db, profiles, profile, catalog, contentError } = useLearner();

  useEffect(() => {
    if (!ready || !db || !catalog) return;
    (async () => {
      if (profiles.length === 0) {
        const checked = await getMeta<boolean>(db, "soundChecked");
        navigate(checked ? "/language" : "/welcome", { replace: true });
        return;
      }
      if (!profile) {
        navigate("/profiles", { replace: true });
        return;
      }
      if (!profile.onboarding.placementDone) {
        navigate(profile.learnerId ? "/start-level" : "/save", { replace: true });
        return;
      }
      navigate("/home", { replace: true });
    })();
  }, [ready, db, catalog, profiles, profile]);

  if (contentError && !catalog) {
    // First launch needs the internet once to fetch the app; afterwards it works offline.
    return (
      <Screen label="offline">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <IconOffline size={96} className="text-ink-soft" />
          <button
            type="button"
            data-testid="retry"
            onClick={() => window.location.reload()}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white"
            aria-label="try again"
          >
            <IconRetry size={40} />
          </button>
        </div>
      </Screen>
    );
  }
  return (
    <Screen label="loading">
      <Spinner />
    </Screen>
  );
}
