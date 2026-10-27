/**
 * Generate docs/consent-scripts.md: every spoken consent and privacy script,
 * in isiZulu and Sesotho with the English source it was written from and
 * each line's review status, for native-speaker, educator and information
 * officer review.
 *
 *   npm run docs:consent            write the file
 *   npm run docs:consent -- --check fail if it is out of date (CI)
 *
 * The scripts themselves live in content/app/lines.json (the app speaks them
 * from there); this document is a view of them and must not be edited by hand.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONSENT_VERSION } from "../src/config/app";
import type { AppLine } from "../src/lib/content/schema";
import { loadContent } from "../src/lib/content/load";

const root = process.cwd();
const check = process.argv.includes("--check");
const OUT = "docs/consent-scripts.md";

/** The scripts, grouped as the learner meets them. */
const SECTIONS: { title: string; when: string; records: string; lines: string[] }[] = [
  {
    title: "Where learning is kept",
    when: "After the learner has chosen a picture and a secret code. Choosing the phone only (guest) stores nothing on the server and needs no server consent.",
    records: "Nothing.",
    lines: ["save.choice", "save.online", "save.phone_only"],
  },
  {
    title: "Consent to keep learning online",
    when: "Before anything about the learner is stored on the server. The five explanation lines play one after another; the agree button unlocks once they have played, and every line can be replayed.",
    records: "`consent_records`: type `account_storage`, script version, language, method `spoken_explanation_button`, time. Nothing is stored if the learner declines.",
    lines: [
      "consent.intro",
      "consent.what",
      "consent.why",
      "consent.who",
      "consent.delete",
      "consent.question",
      "consent.agree",
      "consent.decline",
      "consent.pin",
      "consent.saved",
      "consent.declined",
      "consent.offline",
    ],
  },
  {
    title: "Usage counts (optional, separate question)",
    when: "Straight after agreeing to online storage, answered with the yes and no buttons below; changeable at any time in Me > Privacy.",
    records: "`consent_records`: type `analytics` when the answer is yes; `withdrawn_at` when it later changes to no. Usage events are sent only while this consent is in force.",
    lines: ["consent.analytics", "share.yes", "share.no"],
  },
  {
    title: "Microphone",
    when: "Before the phone asks for microphone permission (listen-and-repeat self-checks, spoken questions to the helper). Refusing changes nothing else.",
    records: "Nothing on the server. Recordings stay in the phone's memory and are discarded when the activity ends.",
    lines: ["mic.explain", "mic.allow", "mic.no", "mic.denied"],
  },
  {
    title: "Joining a class and sharing with it",
    when: "When the learner enters a class code or scans the class QR code, and in Me > Privacy for each class.",
    records: "`consent_records`: type `cohort_sharing` with the chosen fields as scope; a change of sharing records a new consent and ends the old one at once.",
    lines: [
      "join.need_account",
      "share.intro",
      "share.basic",
      "share.mastery",
      "share.mistakes",
      "share.tutor",
      "share.confirm",
      "share.stop_explain",
      "share.stopped",
    ],
  },
  {
    title: "A copy of my information, withdrawing consent, deleting everything",
    when: "Me > Privacy.",
    records:
      "Export: nothing. Withdrawal of online storage and deletion: the learner and everything linked to them is deleted at once (consent records included); `deletion_log` keeps only the time and who started it.",
    lines: ["me.export", "export.done", "consent.withdraw", "me.delete", "delete.explain", "delete.confirm", "delete.done", "delete.offline"],
  },
  {
    title: "Help from a facilitator on the learner's phone",
    when: "When a facilitator signs in on the learner's phone to reset a forgotten code or move the learner to a new phone.",
    records: "`facilitator_assists`: the action and time (included in the learner's data export). The new code is typed by the learner and never shown to the facilitator.",
    lines: ["assist.handover", "assist.new_pin"],
  },
];

/** Points the information officer and reviewers must decide on; they are not settled by translation alone. */
const REVIEW_POINTS = [
  "`consent.who` says only the learner can see their information. The platform operator's staff can also reach it (database administration, and platform administrators see the aggregated, anonymised pilot figures). Decide whether the script must say so.",
  "`consent.what` names the main kinds of information. The full list (device link, consent records, facilitator help, random pseudonym, tutor question text with its retention period) is in docs/data-inventory.md. Decide whether the spoken script needs more detail or a pointer to where the full list can be heard or read.",
  "`consent.delete` says \"tap the picture of the bin\". In the app, deletion is under Me > Privacy and needs a press-and-hold on the red bin button (so it cannot happen by accident). Align the wording with the final screen.",
  "`consent.analytics` asks in one sentence. Confirm that learners understand that \"count how you use the app\" means pseudonymous usage events (which screens and lessons are opened and left, which help is asked for), kept 13 months.",
  "The scripts do not name the responsible party or an information officer contact. POPIA requires that the learner can find out who is responsible; decide how this is given (spoken line, printed sheet from the facilitator, or both).",
  "Pilot research consent is separate from these scripts and is not in the app yet: see docs/pilot-measurement-plan.md.",
];

function generate(): string {
  const { bundle, errors } = loadContent(root);
  if (!bundle) throw new Error(`content did not load:\n${errors.join("\n")}`);
  const problems: string[] = [];
  const lineOf = (id: string): AppLine | undefined => {
    const l = bundle.appLines.get(id);
    if (!l) problems.push(`${id}: no such line in content/app/lines.json`);
    else if (!l.source) problems.push(`${id}: no English "source" text`);
    return l;
  };
  const all = SECTIONS.flatMap((s) => s.lines.map(lineOf)).filter((l): l is AppLine => !!l);
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const approved = (lang: "zu" | "st") => all.filter((l) => l[lang].review.status === "approved").length;
  const status = (l: AppLine, lang: "zu" | "st") => l[lang].review.status.replace(/_/g, " ");
  const md: string[] = [
    "# Consent and privacy scripts",
    "",
    "> **Draft: requires review before any real-world use.** These scripts were written by the product team, not by native speakers. Each must be reviewed by a native isiZulu speaker, a native Sesotho speaker (South African orthography), an adult-literacy educator and the organisation's information officer (POPIA).",
    ">",
    "> Generated from `content/app/lines.json` by `npm run docs:consent`; do not edit by hand. Change the scripts in that file (the app speaks them from there), then regenerate.",
    "",
    `Consent script version: \`${CONSENT_VERSION}\` (\`CONSENT_VERSION\` in \`src/config/app.ts\`). Every consent record stores this version. Bump it whenever a consent script changes: the server refuses consent given under an outdated version, so no record can claim a script the learner did not hear.`,
    "",
    `Review status: ${approved("zu")} of ${all.length} isiZulu lines and ${approved("st")} of ${all.length} Sesotho lines are approved. Until a line is approved the app shows the amber "unreviewed content" marker beside it.`,
    "",
    "How learners meet these scripts: every line is spoken in the learner's language, can be replayed with the large listen-again button, and is shown as a caption for those who read. Buttons carry an icon as well as a short label. Nothing is stored on the server before the learner agrees, and a guest's learning never leaves the phone.",
    "",
    "## Review points for the information officer",
    "",
    ...REVIEW_POINTS.map((p) => `- ${p}`),
    "",
  ];

  SECTIONS.forEach((s, i) => {
    md.push(`## ${i + 1}. ${s.title}`, "", `**When:** ${s.when}`, "", `**What is recorded:** ${s.records}`, "");
    for (const id of s.lines) {
      const l = bundle.appLines.get(id)!;
      md.push(`### \`${id}\``, "", `${l.description}`, "");
      md.push(`- **English (source):** ${l.source}`);
      md.push(`- **isiZulu** (${status(l, "zu")}): ${l.zu.text}${l.zu.label ? ` Button label: "${l.zu.label}".` : ""}`);
      md.push(`- **Sesotho** (${status(l, "st")}): ${l.st.text}${l.st.label ? ` Button label: "${l.st.label}".` : ""}`);
      md.push("");
    }
  });
  return md.join("\n");
}

const text = generate();
if (check) {
  if (!existsSync(join(root, OUT)) || readFileSync(join(root, OUT), "utf8") !== text) {
    console.error(`Out of date: ${OUT}. Run npm run docs:consent and commit.`);
    process.exit(1);
  }
  console.log("Consent scripts document is up to date.");
} else {
  writeFileSync(join(root, OUT), text);
  console.log(`Wrote ${OUT}.`);
}
