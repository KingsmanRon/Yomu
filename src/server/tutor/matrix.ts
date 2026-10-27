import "server-only";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { matrixProblems, type CapabilityMatrix } from "@/lib/capabilities/tiers";

/**
 * The provider capability matrix (config/capabilities.json), read at runtime
 * so a status change takes effect without a rebuild. A file that is missing,
 * malformed or unsafe (for example learner-visible without verification)
 * yields an empty matrix: everything falls back to Tier 1.
 */
const EntrySchema = z
  .object({
    provider: z.string().min(1),
    language: z.enum(["zu", "st", "en"]),
    capability: z.enum(["stt", "tts", "translation", "pronunciation_scoring", "llm_dialogue"]),
    status: z.enum(["verified", "experimental", "unsupported"]),
    verifiedAt: z.string().nullable(),
    verifierRole: z.string().nullable(),
    learnerVisible: z.boolean(),
    notes: z.string(),
  })
  .strict();

const FileSchema = z.object({ version: z.string(), entries: z.array(EntrySchema) }).passthrough();

const EMPTY: CapabilityMatrix = { version: "none", entries: [] };
let cache: { key: string; matrix: CapabilityMatrix; problems: string[] } | null = null;

/**
 * config/capabilities.json, or a test file named by CAPABILITY_MATRIX_PATH.
 * The default path is static so build tracing includes just that file.
 */
function readMatrixFile(): { key: string; read: () => string } {
  const override = process.env.CAPABILITY_MATRIX_PATH;
  if (override) {
    return { key: `${override}:${statSync(/*turbopackIgnore: true*/ override).mtimeMs}`, read: () => readFileSync(/*turbopackIgnore: true*/ override, "utf8") };
  }
  const file = join(process.cwd(), "config", "capabilities.json");
  return { key: `default:${statSync(file).mtimeMs}`, read: () => readFileSync(file, "utf8") };
}

export function loadMatrix(): { matrix: CapabilityMatrix; problems: string[] } {
  let source: ReturnType<typeof readMatrixFile>;
  try {
    source = readMatrixFile();
  } catch {
    return { matrix: EMPTY, problems: ["capability matrix not found"] };
  }
  if (cache && cache.key === source.key) return cache;
  let problems: string[];
  let matrix = EMPTY;
  try {
    const parsed = FileSchema.parse(JSON.parse(source.read()));
    matrix = { version: parsed.version, entries: parsed.entries };
    problems = matrixProblems(matrix);
  } catch (e) {
    problems = [`capability matrix is malformed: ${(e as Error).message.slice(0, 200)}`];
  }
  if (problems.length > 0) {
    console.error("[yomu] capability matrix rejected; all AI tiers disabled:", problems);
    matrix = EMPTY;
  }
  cache = { key: source.key, matrix, problems };
  return cache;
}
