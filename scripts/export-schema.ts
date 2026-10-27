/**
 * Exports the zod content schemas as JSON Schema (draft 2020-12) into
 * content/schema/, so content authors get editor validation and other tools
 * can validate lesson files without this codebase.
 *
 *   npm run content:schema            write the files
 *   npm run content:schema -- --check fail if the committed files are out of date
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  AetOutcomesFileSchema,
  AppLinesSchema,
  AssessmentSchema,
  BadgesFileSchema,
  ClipLibrarySchema,
  ContrastTagsFileSchema,
  CurriculumSchema,
  ImageManifestSchema,
  LessonSchema,
  LexiconFileSchema,
} from "../src/lib/content/schema";

const schemas: Record<string, z.ZodType> = {
  lesson: LessonSchema,
  curriculum: CurriculumSchema,
  lexicon: LexiconFileSchema,
  clips: ClipLibrarySchema,
  "app-lines": AppLinesSchema,
  "contrastive-tags": ContrastTagsFileSchema,
  "aet-outcomes": AetOutcomesFileSchema,
  badges: BadgesFileSchema,
  images: ImageManifestSchema,
  assessment: AssessmentSchema,
};

const dir = join(process.cwd(), "content", "schema");
mkdirSync(dir, { recursive: true });
const check = process.argv.includes("--check");
let stale = 0;

for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any", reused: "ref" }) as Record<string, unknown>;
  json.$id = `https://yomu.invalid/content/schema/${name}.schema.json`;
  json.title = `Yomu content: ${name}`;
  const text = JSON.stringify(json, null, 2) + "\n";
  const file = join(dir, `${name}.schema.json`);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      console.error(`✗ content/schema/${name}.schema.json is out of date: run npm run content:schema`);
      stale += 1;
    }
  } else {
    writeFileSync(file, text);
  }
}
if (check && stale > 0) process.exit(1);
console.log(check ? "✓ JSON Schemas are up to date" : `wrote ${Object.keys(schemas).length} JSON Schemas to content/schema/`);
