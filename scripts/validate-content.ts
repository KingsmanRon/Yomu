/**
 * Validates all curriculum content. Exits non-zero on any error, so CI fails
 * when a lesson is missing an exercise, an answer, an image, an audio asset
 * reference or either language pathway.
 *
 *   npm run content:validate            structure, references, pathways, mastery attainability
 *   npm run content:validate -- --strict  also fail on warnings (orthography heuristics)
 */
import { loadContent } from "../src/lib/content/load";
import { validateContent } from "../src/lib/content/validate";

const strict = process.argv.includes("--strict");
const { bundle, errors: loadErrors } = loadContent();

if (!bundle) {
  console.error(`Content failed to load (${loadErrors.length} problem(s)):`);
  for (const e of loadErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const report = validateContent(bundle);
for (const w of report.warnings) console.warn(`  ! ${w}`);
for (const e of [...loadErrors, ...report.errors]) console.error(`  ✗ ${e}`);

console.log("\nContent summary");
for (const [k, v] of Object.entries(report.stats)) console.log(`  ${k.padEnd(18)} ${v}`);
const unreviewed = report.stats.audioAssets - report.stats.approvedAssets;
if (unreviewed > 0) {
  console.log(
    `\n  ${unreviewed} of ${report.stats.audioAssets} spoken lines are not yet 'approved'. They show the` +
      ` "unreviewed content" marker and must be reviewed by native speakers and adult-literacy educators` +
      ` before real-world use (docs/content-review-checklist.md).`,
  );
}

const failed = loadErrors.length + report.errors.length > 0 || (strict && report.warnings.length > 0);
console.log(failed ? `\n✗ Content validation failed: ${report.errors.length} error(s), ${report.warnings.length} warning(s).` : `\n✓ Content valid (${report.warnings.length} warning(s)).`);
process.exit(failed ? 1 : 0);
