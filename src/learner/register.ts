import { CONSENT_VERSION } from "@/config/app";
import { api } from "./offline/api";
import { signInAnonymously } from "./offline/auth";
import type { StoredProfile, YomuDB } from "./offline/db";
import { markAllUnsynced } from "./offline/oplog";
import { updateProfile } from "./offline/profiles";

/**
 * Register a device profile on the server, after the learner agreed to the
 * spoken consent. All learning done so far as a guest is kept: every op is
 * still in the local log and is uploaded by the first sync, so a guest who
 * registers loses nothing.
 */
export async function registerProfile(
  db: YomuDB,
  profile: StoredProfile,
  input: { pin: string; analytics: boolean },
): Promise<StoredProfile> {
  const token = await signInAnonymously(profile.id);
  const { learnerId } = await api<{ learnerId: string }>(profile.id, "/api/learner/register", {
    token,
    body: {
      deviceProfileId: profile.id,
      teachingLanguage: profile.language,
      avatarId: profile.avatarId,
      pin: input.pin,
      nickname: profile.nickname,
      consent: { version: CONSENT_VERSION, language: profile.language, analytics: input.analytics },
    },
  });
  await markAllUnsynced(db, profile.id);
  return updateProfile(db, profile.id, {
    learnerId,
    registeredAt: new Date().toISOString(),
    analyticsConsent: input.analytics,
    syncCursor: 0,
  });
}
