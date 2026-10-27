import { describe, expect, it } from "vitest";
import type { CompiledAudio } from "@/lib/content/compiled";
import { loadContent, type ContentBundle } from "@/lib/content/load";
import { validateContent } from "@/lib/content/validate";
import { compiledContent } from "./compiled-fixture";

/** A fresh copy of the real content, safe to break. */
function bundle(): ContentBundle {
  const { bundle: b, errors } = loadContent();
  if (!b) throw new Error(`content did not load: ${errors.join("; ")}`);
  return b;
}

const lesson = (b: ContentBundle, id: string) => b.lessons.find((l) => l.id === id)!;
const errorsOf = (b: ContentBundle) => validateContent(b).errors;

describe("content validation", () => {
  it("passes the shipped curriculum", () => {
    expect(errorsOf(bundle())).toEqual([]);
  });

  it("fails when a step has no Sesotho (or isiZulu) line", () => {
    const b = bundle();
    const step = lesson(b, "l00-hl-vowels").steps.find((s) => s.id === "l00-hl-vowels.t01") as { line: { st?: unknown } };
    delete step.line.st;
    expect(errorsOf(b).join("\n")).toMatch(/l00-hl-vowels\.t01.*missing Sesotho pathway line/);
  });

  it("fails when a lesson has no exercises", () => {
    const b = bundle();
    const l = lesson(b, "l20-blending");
    l.steps = l.steps.filter((s) => !("type" in s));
    const errors = errorsOf(b).join("\n");
    expect(errors).toMatch(/has no exercises on the zu pathway/);
    expect(errors).toMatch(/has no exercises on the st pathway/);
  });

  it("fails when the answer is not among the options", () => {
    const b = bundle();
    const ex = lesson(b, "l20-blending").steps.find((s) => s.id === "l20-blending.e01") as { target: string };
    ex.target = "en.w.sun";
    expect(errorsOf(b).join("\n")).toMatch(/l20-blending\.e01.*the target must be one of the options/);
  });

  it("fails when a picture has no entry in the licence manifest", () => {
    const b = bundle();
    b.images.delete("cat");
    expect(errorsOf(b).join("\n")).toMatch(/image 'cat' is not in content\/images\.json/);
  });

  it("fails when English model audio would be another language's recording", () => {
    const b = bundle();
    const cat = b.lexicon.get("en.w.cat")!;
    cat.audio = { ...cat.audio!, id: "zu.w.cat" };
    expect(errorsOf(b).join("\n")).toMatch(/model audio 'zu\.w\.cat' must be in the entry's own language \(en\)/);
  });

  it("fails when a reading objective could be mastered without independent decoding", () => {
    const b = bundle();
    const o = lesson(b, "l20-blending").objectives.find((x) => x.id === "obj.l20.read-cvc")!;
    o.masteryCompetencies = ["recognise"];
    expect(errorsOf(b).join("\n")).toMatch(/a reading objective must require 'decode'/);
  });
});

describe("compiled lessons", () => {
  const out = compiledContent();
  const audioIn = (value: unknown, found: CompiledAudio[] = []): CompiledAudio[] => {
    if (Array.isArray(value)) for (const v of value) audioIn(v, found);
    else if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.src === "string" && typeof o.placeholder === "boolean" && typeof o.lang === "string") found.push(o as unknown as CompiledAudio);
      else for (const v of Object.values(o)) audioIn(v, found);
    }
    return found;
  };

  it("give every line of both pathways a recording or a labelled placeholder", () => {
    for (const lang of ["zu", "st"] as const) {
      expect(out.lessons[lang]).toHaveLength(13);
      for (const l of out.lessons[lang]) {
        const lines = [l.title.line, l.intro, l.outro, ...l.steps.filter((s) => s.kind === "teach").map((s) => s.line)];
        for (const line of lines) expect(line.audio, `${lang} ${l.id} ${line.id}`).not.toBeNull();
      }
    }
  });

  it("only ever contain audio in the pathway's language, or English model audio", () => {
    for (const lang of ["zu", "st"] as const) {
      const other = lang === "zu" ? "st" : "zu";
      for (const l of out.lessons[lang]) {
        const langs = new Set(audioIn(l).map((a) => a.lang));
        expect(langs.has(other), `${lang} ${l.id} contains ${other} audio`).toBe(false);
      }
      // Interface lines and tutor clips are spoken in the teaching language only: never English.
      expect(new Set(audioIn(out.app[lang]).map((a) => a.lang))).toEqual(new Set([lang]));
      expect(new Set(audioIn(out.clips[lang]).map((a) => a.lang))).toEqual(new Set([lang]));
    }
  });
});
