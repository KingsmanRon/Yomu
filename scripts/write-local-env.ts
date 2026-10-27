/**
 * Write .env.local for local development from the running local Supabase:
 *
 *   npx supabase start
 *   npm run env:local
 *
 * Starts from .env.example (or keeps an existing .env.local) and fills in the
 * Supabase URL and keys printed by `supabase status`. Local keys only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const status = spawnSync(join(root, "node_modules", ".bin", "supabase"), ["status", "-o", "env"], { encoding: "utf8" });
if (status.status !== 0) {
  console.error("Could not read `supabase status`. Is the local stack running (npx supabase start)?");
  console.error(status.stderr);
  process.exit(1);
}
const values = Object.fromEntries(
  status.stdout
    .split("\n")
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1], m[2]]),
);
const wanted: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: values.SECRET_KEY,
};
for (const [k, v] of Object.entries(wanted)) {
  if (!v) {
    console.error(`supabase status did not report a value for ${k}`);
    process.exit(1);
  }
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(wanted.NEXT_PUBLIC_SUPABASE_URL!)) {
  console.error(`Refusing to write ${wanted.NEXT_PUBLIC_SUPABASE_URL}: not a local Supabase.`);
  process.exit(1);
}

const target = join(root, ".env.local");
let text = readFileSync(existsSync(target) ? target : join(root, ".env.example"), "utf8");
for (const [k, v] of Object.entries(wanted)) {
  const line = `${k}=${v}`;
  text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
}
writeFileSync(target, text);
console.log(`Wrote ${target} for the local Supabase at ${wanted.NEXT_PUBLIC_SUPABASE_URL}.`);
