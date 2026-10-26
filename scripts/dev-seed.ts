/**
 * Local development data: staff accounts, an organisation and a class, so the
 * facilitator, organisation and reviewer screens can be tried. Learners are
 * never seeded; they are created by going through onboarding in the app.
 *
 *   npm run db:seed-dev
 *
 * Refuses to run against anything but a local Supabase (127.0.0.1/localhost)
 * unless --allow-remote is given, so it cannot touch a production project by
 * accident. Safe to repeat: existing records are reused.
 */
import { must, scriptClient } from "./lib/supabase";

const PASSWORD = "yomu-dev-password";
const STAFF = [
  { email: "facilitator@yomu.test", name: "Thandi (facilitator)", role: "facilitator" },
  { email: "admin@yomu.test", name: "Pieter (organisation admin)", role: "org_admin" },
  { email: "reviewer@yomu.test", name: "Lerato (content reviewer)", role: "content_reviewer" },
  { email: "platform@yomu.test", name: "Platform admin", role: "platform_admin" },
] as const;

const db = scriptClient("seed development accounts");

async function userId(email: string): Promise<string> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`could not create ${email}`);
  return data.user.id;
}

async function main() {
  const foundOrg = (await must(db.from("organisations").select("id").eq("name", "Demo Skills Centre").maybeSingle(), "find organisation")) as { id: string } | null;
  const org =
    foundOrg ?? ((await must(db.from("organisations").insert({ name: "Demo Skills Centre", kind: "aet_provider" }).select("id").single(), "create organisation")) as { id: string });

  const ids: Record<string, string> = {};
  for (const s of STAFF) {
    const id = await userId(s.email);
    ids[s.role] = id;
    const orgId = s.role === "facilitator" || s.role === "org_admin" ? org.id : null;
    const existing = await must(
      db.from("staff_roles").select("id").eq("user_id", id).eq("role", s.role).limit(1),
      `find role ${s.role}`,
    );
    if ((existing as unknown[]).length === 0) {
      await must(db.from("staff_roles").insert({ user_id: id, role: s.role, organisation_id: orgId, display_name: s.name }), `add role ${s.role}`);
    }
  }

  type Cohort = { id: string; join_code: string };
  let cohort = (await must(db.from("cohorts").select("id, join_code").eq("organisation_id", org.id).eq("name", "Morning class").maybeSingle(), "find class")) as Cohort | null;
  if (!cohort) {
    let code = "";
    for (;;) {
      code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
      const taken = await must(db.from("cohorts").select("id").eq("join_code", code).limit(1), "check code");
      if ((taken as unknown[]).length === 0) break;
    }
    cohort = (await must(
      db.from("cohorts").insert({ organisation_id: org.id, name: "Morning class", join_code: code, created_by: ids.facilitator }).select("id, join_code").single(),
      "create class",
    )) as Cohort;
  }
  const link = await must(db.from("cohort_facilitators").select("cohort_id").eq("cohort_id", cohort.id).eq("user_id", ids.facilitator), "find facilitator link");
  if ((link as unknown[]).length === 0) {
    await must(db.from("cohort_facilitators").insert({ cohort_id: cohort.id, user_id: ids.facilitator }), "link facilitator");
  }

  console.log("Seeded local development data (password for all accounts: %s)", PASSWORD);
  for (const s of STAFF) console.log(`  ${s.role.padEnd(17)} ${s.email}`);
  console.log(`  class "Morning class" join code: ${cohort.join_code}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
