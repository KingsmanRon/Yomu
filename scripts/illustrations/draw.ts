/**
 * Original illustrations for the app, drawn in code so the style stays
 * consistent and every picture can be regenerated or adjusted.
 *
 *   npx tsx scripts/illustrations/draw.ts
 *
 * Writes public/images/*.svg. All artwork was created for this project and is
 * released under the repository licence (MIT); see content/images.json.
 * People are adults with a range of skin tones, in South African settings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "images");

const C = {
  ink: "#1F2937",
  teal: "#0F766E",
  tealSoft: "#99F6E4",
  ochre: "#D97706",
  ochreSoft: "#FDE68A",
  terracotta: "#C2410C",
  terracottaSoft: "#FED7AA",
  navy: "#1E3A5F",
  green: "#15803D",
  greenSoft: "#BBF7D0",
  red: "#DC2626",
  blue: "#1D4ED8",
  blueSoft: "#BFDBFE",
  grey: "#6B7280",
  greyMid: "#9CA3AF",
  greySoft: "#E5E7EB",
  white: "#FFFFFF",
  cream: "#FFF7ED",
  brown: "#7C2D12",
  wood: "#A16207",
  yellow: "#FACC15",
  sky: "#E0F2FE",
  purple: "#6D28D9",
};
const SKIN = ["#8D5524", "#5C3317", "#A9744F", "#6E4024"];

const images = new Map<string, string>();

function save(id: string, body: string, viewBox = "0 0 200 200") {
  images.set(id, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`);
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${extra}/>`;
const circle = (cx: number, cy: number, r: number, fill: string, extra = "") =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra}/>`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"${extra}/>`;
const poly = (points: number[][], stroke: string, w: number, fill = "none") =>
  `<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const text = (x: number, y: number, s: string, size: number, fill: string, weight = 800) =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${s}</text>`;
const ground = (y = 186) => ellipse(100, y, 70, 7, C.greySoft);

type Hair = "short" | "doek" | "bun" | "hardhat" | "cap" | "chef" | "bald";

function head(cx: number, cy: number, skin: string, hair: Hair, hairColour = C.ink): string {
  let s = "";
  if (hair === "bun") s += circle(cx, cy - 20, 9, hairColour);
  s += circle(cx, cy, 17, skin);
  s += ellipse(cx - 17, cy + 1, 3, 5, skin) + ellipse(cx + 17, cy + 1, 3, 5, skin);
  if (hair === "short" || hair === "bun") s += path(`M${cx - 17} ${cy - 2} Q${cx} ${cy - 30} ${cx + 17} ${cy - 2} Q${cx + 12} ${cy - 13} ${cx} ${cy - 13} Q${cx - 12} ${cy - 13} ${cx - 17} ${cy - 2}Z`, hairColour);
  if (hair === "doek") s += path(`M${cx - 19} ${cy - 2} Q${cx - 20} ${cy - 30} ${cx} ${cy - 30} Q${cx + 22} ${cy - 30} ${cx + 19} ${cy - 2} Q${cx} ${cy - 12} ${cx - 19} ${cy - 2}Z`, C.terracotta) + circle(cx + 14, cy - 24, 6, C.terracotta);
  if (hair === "hardhat") s += path(`M${cx - 21} ${cy - 5} Q${cx} ${cy - 36} ${cx + 21} ${cy - 5}Z`, C.yellow) + rect(cx - 24, cy - 7, 48, 5, C.yellow, 2);
  if (hair === "cap") s += path(`M${cx - 17} ${cy - 4} Q${cx} ${cy - 30} ${cx + 17} ${cy - 4}Z`, C.navy) + rect(cx, cy - 8, 24, 5, C.navy, 2);
  if (hair === "chef") {
    const o = ` stroke="${C.greyMid}" stroke-width="2"`;
    s += circle(cx - 8, cy - 32, 9, C.white, o) + circle(cx + 8, cy - 32, 9, C.white, o) + rect(cx - 16, cy - 30, 32, 16, C.white, 6, o);
  }
  // Eyes and a calm smile.
  s += circle(cx - 6, cy + 1, 2, C.ink) + circle(cx + 6, cy + 1, 2, C.ink);
  s += path(`M${cx - 6} ${cy + 8} Q${cx} ${cy + 12} ${cx + 6} ${cy + 8}`, "none", ` stroke="${C.ink}" stroke-width="2" stroke-linecap="round"`);
  return s;
}

interface PersonOpts {
  x?: number;
  skin?: string;
  hair?: Hair;
  shirt?: string;
  legs?: string;
  skirt?: boolean;
  /** Arm end points (hands), relative to the default standing pose. */
  left?: [number, number];
  right?: [number, number];
  scale?: number;
}

/** A standing adult, about 150 units tall, feet at y=180. */
function person(o: PersonOpts = {}): string {
  const x = o.x ?? 100;
  const skin = o.skin ?? SKIN[0];
  const shirt = o.shirt ?? C.teal;
  const legs = o.legs ?? C.navy;
  const lh = o.left ?? [x - 28, 120];
  const rh = o.right ?? [x + 28, 120];
  let s = "";
  // legs
  if (o.skirt) {
    s += path(`M${x - 22} 118 L${x + 22} 118 L${x + 28} 158 L${x - 28} 158Z`, legs);
    s += line(x - 10, 158, x - 10, 176, skin, 9) + line(x + 10, 158, x + 10, 176, skin, 9);
  } else {
    s += line(x - 11, 120, x - 12, 174, legs, 15) + line(x + 11, 120, x + 12, 174, legs, 15);
  }
  s += ellipse(x - 14, 179, 11, 5, C.ink) + ellipse(x + 14, 179, 11, 5, C.ink);
  // arms (behind torso edges)
  s += line(x - 20, 76, lh[0], lh[1], shirt, 12) + circle(lh[0], lh[1], 6, skin);
  s += line(x + 20, 76, rh[0], rh[1], shirt, 12) + circle(rh[0], rh[1], 6, skin);
  // torso and neck
  s += rect(x - 6, 58, 12, 12, skin, 3);
  s += path(`M${x - 24} 72 Q${x} 62 ${x + 24} 72 L${x + 22} 124 L${x - 22} 124Z`, shirt);
  s += head(x, 44, skin, o.hair ?? "short");
  return o.scale && o.scale !== 1
    ? `<g transform="translate(${x} 180) scale(${o.scale}) translate(${-x} -180)">${s}</g>`
    : s;
}

/* ------------------------------------------------------------------ */
/* Lesson pictures                                                     */
/* ------------------------------------------------------------------ */

save(
  "cat",
  ground() +
    path("M60 178 Q52 120 92 112 L126 112 Q156 116 150 178Z", C.ochre) +
    path("M150 170 Q182 160 176 128", "none", ` stroke="${C.ochre}" stroke-width="10" stroke-linecap="round"`) +
    circle(108, 86, 34, C.ochre) +
    path("M80 66 L82 36 L102 58Z", C.ochre) +
    path("M136 66 L134 36 L114 58Z", C.ochre) +
    path("M86 60 L87 46 L97 57Z", C.terracottaSoft) +
    path("M130 60 L129 46 L119 57Z", C.terracottaSoft) +
    ellipse(96, 84, 5, 7, C.green) + ellipse(120, 84, 5, 7, C.green) +
    circle(96, 85, 2.5, C.ink) + circle(120, 85, 2.5, C.ink) +
    path("M104 96 L112 96 L108 101Z", C.terracotta) +
    line(84, 100, 64, 96, C.ink, 1.5) + line(84, 104, 64, 106, C.ink, 1.5) +
    line(132, 100, 152, 96, C.ink, 1.5) + line(132, 104, 152, 106, C.ink, 1.5) +
    path("M80 128 Q100 136 120 128", "none", ` stroke="${C.wood}" stroke-width="4" opacity="0.5"`),
);

save(
  "sit",
  ground() +
    // chair
    rect(98, 120, 54, 8, C.wood, 3) + rect(140, 70, 8, 58, C.wood, 3) +
    line(104, 128, 104, 178, C.wood, 6) + line(146, 128, 146, 178, C.wood, 6) +
    // seated person (side-on)
    line(110, 122, 74, 124, C.navy, 15) + line(74, 124, 74, 172, C.navy, 14) +
    ellipse(66, 177, 12, 5, C.ink) +
    path("M100 76 Q120 70 132 80 L128 126 L100 126Z", C.terracotta) +
    line(112, 86, 92, 112, C.terracotta, 11) + circle(90, 114, 6, SKIN[1]) +
    rect(110, 60, 11, 12, SKIN[1], 3) +
    head(116, 46, SKIN[1], "short"),
);

save(
  "map",
  rect(30, 46, 140, 108, C.cream, 6, ` stroke="${C.greyMid}" stroke-width="3"`) +
    path("M76 46 L76 154 M124 46 L124 154", "none", ` stroke="${C.greyMid}" stroke-width="2" stroke-dasharray="4 4"`) +
    path("M30 110 Q70 90 100 112 T170 96", "none", ` stroke="${C.blueSoft}" stroke-width="12"`) +
    poly([[48, 136], [70, 120], [96, 128], [118, 96], [150, 76]], C.terracotta, 5) +
    path("M150 50 Q164 50 164 64 Q164 76 150 92 Q136 76 136 64 Q136 50 150 50Z", C.red) +
    circle(150, 64, 5, C.white) + circle(48, 136, 6, C.green),
);

save(
  "pen",
  `<g transform="rotate(-35 100 100)">` +
    rect(40, 88, 110, 24, C.blue, 8) + rect(40, 88, 26, 24, C.navy, 6) +
    rect(64, 84, 46, 6, C.greyMid, 3) +
    path("M150 88 L178 100 L150 112Z", C.greySoft) + path("M170 96 L180 100 L170 104Z", C.ink) +
    `</g>`,
);

save(
  "pan",
  ground(176) +
    ellipse(88, 118, 62, 34, C.ink) + ellipse(88, 112, 56, 28, C.grey) + ellipse(88, 110, 46, 21, C.greyMid) +
    rect(144, 104, 52, 12, C.wood, 6),
);

save(
  "tin",
  ground(178) +
    rect(58, 50, 84, 122, C.greyMid, 6) +
    ellipse(100, 50, 42, 10, C.greySoft) + ellipse(100, 50, 34, 7, C.greyMid) +
    rect(58, 82, 84, 58, C.terracotta) +
    circle(100, 111, 18, C.ochreSoft) + circle(100, 111, 10, C.red) +
    ellipse(100, 172, 42, 8, C.grey),
);

save("ten", rect(28, 40, 144, 120, C.ochreSoft, 16) + text(100, 136, "10", 92, C.navy));

save(
  "man",
  ground() + person({ skin: SKIN[1], hair: "short", shirt: C.green, legs: C.navy }),
);

save(
  "dad",
  ground() +
    person({ x: 78, skin: SKIN[0], hair: "short", shirt: C.blue, legs: C.ink, right: [118, 120] }) +
    // child holding the father's hand
    `<g transform="translate(130 180) scale(0.62) translate(-130 -180)">` +
    person({ x: 130, skin: SKIN[0], hair: "short", shirt: C.ochre, legs: C.teal, left: [96, 108] }) +
    `</g>`,
);

save(
  "woman",
  ground() + person({ skin: SKIN[2], hair: "doek", shirt: C.purple, legs: C.terracotta, skirt: true }),
);

save(
  "sun",
  Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return line(100 + Math.cos(a) * 52, 100 + Math.sin(a) * 52, 100 + Math.cos(a) * 76, 100 + Math.sin(a) * 76, C.ochre, 8);
  }).join("") + circle(100, 100, 42, C.yellow) + circle(100, 100, 42, "none", ` stroke="${C.ochre}" stroke-width="4"`),
);

save(
  "bus",
  ground(170) +
    rect(18, 64, 168, 88, C.ochre, 14) + rect(18, 128, 168, 10, C.terracotta) +
    rect(28, 76, 30, 30, C.sky, 4) + rect(64, 76, 30, 30, C.sky, 4) + rect(100, 76, 30, 30, C.sky, 4) +
    rect(140, 76, 36, 48, C.sky, 4) + line(158, 76, 158, 124, C.ochre, 3) +
    circle(56, 154, 15, C.ink) + circle(56, 154, 6, C.greyMid) +
    circle(150, 154, 15, C.ink) + circle(150, 154, 6, C.greyMid) +
    rect(180, 112, 8, 10, C.yellow, 2),
);

save(
  "tap",
  rect(26, 40, 26, 50, C.greyMid, 4) +
    rect(46, 52, 84, 22, C.greyMid, 8) +
    path("M118 52 Q150 52 150 84 L150 100 L128 100 L128 84 Q128 74 118 74Z", C.greyMid) +
    rect(78, 36, 10, 18, C.grey, 3) + rect(62, 30, 42, 10, C.blue, 5) +
    path("M139 112 Q131 126 139 132 Q147 126 139 112Z", C.blue) +
    path("M139 144 Q131 158 139 164 Q147 158 139 144Z", C.blue),
);

save(
  "work",
  ground() +
    person({ skin: SKIN[3], hair: "hardhat", shirt: C.navy, legs: C.navy, right: [140, 98] }) +
    // high-visibility vest stripes
    rect(78, 92, 44, 6, C.ochre) + rect(78, 106, 44, 6, C.ochre) +
    // spanner in hand
    line(140, 98, 162, 76, C.greyMid, 7) + circle(165, 73, 8, C.greyMid) + circle(165, 73, 3, C.white),
);

save(
  "me",
  ground() +
    person({ skin: SKIN[2], hair: "bun", shirt: C.teal, legs: C.ink, right: [104, 90] }) +
    // index finger pointing at own chest
    line(104, 90, 98, 88, SKIN[2], 4),
);

save(
  "you",
  ground() +
    person({ skin: SKIN[0], hair: "short", shirt: C.terracotta, legs: C.navy, right: [118, 104] }) +
    // arm reaching towards the viewer: large hand in front, finger pointing out
    circle(118, 104, 16, SKIN[0]) + circle(118, 104, 7, SKIN[3]) +
    path("M140 92 L156 84 M142 106 L160 106 M140 120 L156 128", "none", ` stroke="${C.ochre}" stroke-width="4" stroke-linecap="round"`),
);

save(
  "clinic",
  ground(178) +
    rect(30, 70, 140, 104, C.white, 4, ` stroke="${C.greyMid}" stroke-width="3"`) +
    path("M22 74 L100 30 L178 74Z", C.teal) +
    rect(86, 120, 28, 54, C.blue, 3) +
    rect(42, 90, 30, 24, C.sky, 3) + rect(128, 90, 30, 24, C.sky, 3) +
    circle(100, 92, 17, C.white, ` stroke="${C.green}" stroke-width="3"`) +
    rect(95, 80, 10, 24, C.green) + rect(88, 87, 24, 10, C.green),
);

save(
  "calendar",
  rect(34, 40, 132, 130, C.white, 10, ` stroke="${C.greyMid}" stroke-width="3"`) +
    rect(34, 40, 132, 30, C.red, 10) + rect(34, 58, 132, 12, C.red) +
    line(64, 30, 64, 52, C.ink, 7) + line(136, 30, 136, 52, C.ink, 7) +
    Array.from({ length: 12 }, (_, i) => {
      const x = 50 + (i % 4) * 30;
      const y = 84 + Math.floor(i / 4) * 28;
      return i === 0 ? rect(x - 2, y - 2, 24, 22, C.ochre, 5) : rect(x, y, 20, 18, C.greySoft, 4);
    }).join(""),
);

save(
  "phone",
  rect(60, 22, 80, 156, C.ink, 14) + rect(66, 36, 68, 118, C.sky, 4) + circle(100, 165, 6, C.greyMid) + rect(88, 28, 24, 4, C.greyMid, 2),
);

save(
  "sms",
  rect(60, 22, 80, 156, C.ink, 14) + rect(66, 36, 68, 118, C.white, 4) +
    path("M74 56 L126 56 Q130 56 130 60 L130 86 Q130 90 126 90 L86 90 L76 98 L78 90 L74 90 Q70 90 70 86 L70 60 Q70 56 74 56Z", C.greenSoft) +
    line(80, 66, 120, 66, C.green, 3) + line(80, 76, 112, 76, C.green, 3) +
    circle(100, 165, 6, C.greyMid),
);

save(
  "airtime",
  rect(48, 22, 80, 156, C.ink, 14) + rect(54, 36, 68, 118, C.white, 4) +
    // signal bars, only the first filled
    rect(64, 120, 9, 14, C.red, 2) + rect(77, 110, 9, 24, C.greySoft, 2) + rect(90, 100, 9, 34, C.greySoft, 2) + rect(103, 90, 9, 44, C.greySoft, 2) +
    circle(88, 165, 6, C.greyMid) +
    // a coin with a down arrow: credit running out
    circle(150, 70, 26, C.yellow, ` stroke="${C.ochre}" stroke-width="4"`) +
    path("M150 56 L150 82 M140 74 L150 84 L160 74", "none", ` stroke="${C.ochre}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`),
);

save(
  "bank",
  ground(180) +
    path("M24 70 L100 28 L176 70Z", C.navy) + rect(30, 70, 140, 10, C.navy) +
    [44, 76, 108, 140].map((x) => rect(x, 84, 16, 76, C.greySoft)).join("") +
    rect(24, 160, 152, 14, C.navy) +
    circle(100, 54, 10, C.yellow),
);

save(
  "shop",
  ground(180) +
    rect(30, 76, 140, 100, C.cream, 4, ` stroke="${C.greyMid}" stroke-width="3"`) +
    Array.from({ length: 7 }, (_, i) => path(`M${30 + i * 20} 60 L${50 + i * 20} 60 L${50 + i * 20} 76 Q${40 + i * 20} 88 ${30 + i * 20} 76Z`, i % 2 ? C.white : C.red)).join("") +
    rect(30, 50, 140, 12, C.red, 3) +
    rect(42, 96, 56, 44, C.sky, 3) + rect(112, 96, 44, 80, C.wood, 3) + circle(148, 138, 3, C.yellow) +
    circle(56, 128, 7, C.ochre) + circle(72, 130, 7, C.green) + circle(86, 127, 7, C.red),
);

save(
  "money",
  `<g transform="rotate(-8 100 100)">` +
    rect(22, 56, 130, 70, C.green, 6) + rect(30, 64, 114, 54, C.greenSoft, 4) + circle(87, 91, 17, C.green) +
    `</g>` +
    `<g transform="rotate(6 100 100)">` +
    rect(44, 80, 130, 70, C.blue, 6) + rect(52, 88, 114, 54, C.blueSoft, 4) + circle(109, 115, 17, C.blue) +
    `</g>` +
    circle(150, 160, 18, C.yellow, ` stroke="${C.ochre}" stroke-width="4"`) + circle(116, 168, 14, C.greyMid, ` stroke="${C.grey}" stroke-width="3"`),
);

save(
  "id-book",
  rect(52, 28, 100, 144, C.green, 8) + rect(52, 28, 14, 144, "#166534", 6) +
    circle(108, 84, 22, C.ochreSoft) + circle(108, 84, 12, C.ochre) +
    rect(80, 124, 56, 8, C.ochreSoft, 4) + rect(88, 140, 40, 6, C.ochreSoft, 3),
);

save(
  "cleaner",
  ground() +
    person({ skin: SKIN[1], hair: "doek", shirt: C.blue, legs: C.navy, skirt: true, right: [134, 104], left: [126, 132] }) +
    line(146, 40, 120, 170, C.wood, 6) + path("M100 166 L140 166 L146 182 L94 182Z", C.greyMid),
);

save(
  "cook",
  ground() +
    person({ skin: SKIN[2], hair: "chef", shirt: C.white, legs: C.ink, left: [70, 104], right: [130, 104] }) +
    rect(72, 104, 56, 10, C.white) +
    path("M66 100 L134 100 L128 132 L72 132Z", C.grey) + rect(58, 98, 84, 6, C.ink, 3) +
    path("M88 88 Q84 78 90 70 M110 88 Q106 78 112 70", "none", ` stroke="${C.greyMid}" stroke-width="3" stroke-linecap="round"`),
);

save(
  "driver",
  // minibus taxi from the side with the driver at the wheel
  ground(176) +
    rect(14, 60, 172, 96, C.white, 16, ` stroke="${C.greyMid}" stroke-width="3"`) +
    rect(14, 128, 172, 10, C.teal) +
    rect(118, 72, 56, 46, C.sky, 6) +
    head(146, 92, SKIN[3], "cap") +
    circle(128, 108, 12, "none", ` stroke="${C.ink}" stroke-width="5"`) +
    rect(26, 72, 36, 30, C.sky, 4) + rect(68, 72, 40, 30, C.sky, 4) +
    circle(52, 158, 15, C.ink) + circle(52, 158, 6, C.greyMid) + circle(150, 158, 15, C.ink) + circle(150, 158, 6, C.greyMid),
);

save(
  "ship",
  rect(0, 140, 200, 60, C.blueSoft) +
    path("M20 120 L180 120 L160 156 L40 156Z", C.navy) +
    rect(56, 92, 80, 28, C.white, 3) + rect(68, 72, 34, 20, C.white, 3) + rect(110, 60, 14, 32, C.red, 2) +
    [66, 86, 106, 126].map((x) => circle(x, 106, 4, C.blue)).join("") +
    path("M10 170 Q30 160 50 170 T90 170 T130 170 T170 170 T210 170", "none", ` stroke="${C.blue}" stroke-width="3"`),
);

save(
  "sheep",
  ground() +
    line(70, 140, 70, 178, C.ink, 8) + line(86, 144, 86, 178, C.ink, 8) + line(118, 144, 118, 178, C.ink, 8) + line(134, 140, 134, 178, C.ink, 8) +
    [[70, 104], [94, 92], [120, 98], [136, 116], [118, 136], [90, 138], [66, 124], [100, 116]].map(([x, y]) => circle(x, y, 22, C.cream, ` stroke="${C.greySoft}" stroke-width="2"`)).join("") +
    ellipse(158, 108, 18, 22, C.ink) + ellipse(146, 98, 8, 5, C.ink) + circle(164, 104, 3, C.white),
);

save(
  "milk",
  // a bottle of milk and a glass
  ground(180) +
    path("M64 60 L64 44 L92 44 L92 60 L104 80 L104 176 L52 176 L52 80Z", C.white, ` stroke="${C.greyMid}" stroke-width="3"`) +
    rect(62, 34, 32, 12, C.blue, 3) + rect(54, 104, 48, 34, C.blueSoft) +
    path("M120 108 L160 108 L154 176 L126 176Z", C.white, ` stroke="${C.greyMid}" stroke-width="3"`) +
    path("M122 124 L158 124 L154 174 L126 174Z", C.cream),
);

save(
  "water",
  // a bucket of water
  ground(180) +
    path("M46 70 L154 70 L140 176 L60 176Z", C.greyMid) +
    ellipse(100, 70, 54, 12, C.grey) + ellipse(100, 72, 48, 9, C.blue) +
    path("M46 70 Q100 10 154 70", "none", ` stroke="${C.grey}" stroke-width="5"`) +
    path("M100 96 Q88 116 100 126 Q112 116 100 96Z", C.blueSoft),
);

save(
  "dog",
  ground() +
    path("M50 108 Q48 92 64 90 L132 90 Q146 92 146 108 L146 130 Q144 140 132 140 L64 140 Q50 140 50 128Z", C.wood) +
    line(62, 136, 62, 176, C.wood, 11) + line(84, 138, 84, 178, C.wood, 11) + line(120, 138, 120, 178, C.wood, 11) + line(138, 136, 138, 176, C.wood, 11) +
    path("M50 104 Q30 90 34 70", "none", ` stroke="${C.wood}" stroke-width="9" stroke-linecap="round"`) +
    circle(150, 82, 26, C.wood) + ellipse(172, 90, 16, 12, C.wood) + circle(184, 88, 5, C.ink) +
    path("M136 64 Q128 88 142 96Z", C.brown) + circle(152, 78, 4, C.ink),
);

save(
  "house",
  ground(180) +
    rect(40, 92, 120, 84, C.cream, 2, ` stroke="${C.greyMid}" stroke-width="3"`) +
    path("M28 96 L100 40 L172 96Z", C.terracotta) +
    rect(88, 124, 26, 52, C.wood, 3) + rect(54, 108, 26, 24, C.sky, 3) + rect(124, 108, 26, 24, C.sky, 3) +
    rect(134, 50, 14, 30, C.greyMid),
);

save(
  "bread",
  ground(170) +
    path("M30 150 L30 104 Q30 64 100 64 Q170 64 170 104 L170 150 Q170 160 160 160 L40 160 Q30 160 30 150Z", C.ochre) +
    path("M38 104 Q38 74 100 74 Q162 74 162 104", "none", ` stroke="${C.ochreSoft}" stroke-width="6"`) +
    path("M72 80 L84 100 M100 78 L112 98 M128 80 L140 100", "none", ` stroke="${C.brown}" stroke-width="4" stroke-linecap="round"`),
);

/* ------------------------------------------------------------------ */
/* Signs (teaching pictures) and sign meanings                         */
/* ------------------------------------------------------------------ */

const sign = (bg: string, fg: string, label: string, size: number, shape = "rect") =>
  (shape === "octagon"
    ? path("M70 20 L130 20 L180 70 L180 130 L130 180 L70 180 L20 130 L20 70Z", bg, ` stroke="${C.white}" stroke-width="6"`)
    : rect(14, 52, 172, 96, bg, 12, ` stroke="${C.white}" stroke-width="6"`)) + text(100, shape === "octagon" ? 116 : 114, label, size, fg);

save("sign-stop", sign(C.red, C.white, "STOP", 46, "octagon"));
save("sign-exit", sign(C.green, C.white, "EXIT", 50));
save("sign-danger", sign(C.white, C.red, "DANGER", 30) + rect(14, 52, 172, 96, "none", 12, ` stroke="${C.red}" stroke-width="8"`));
save("sign-toilets", sign(C.blue, C.white, "TOILETS", 32));
save("sign-open", sign(C.green, C.white, "OPEN", 50));
save("sign-closed", sign(C.red, C.white, "CLOSED", 33));

save(
  "meaning-exit",
  ground() +
    rect(104, 30, 72, 150, C.wood, 4) + rect(112, 38, 56, 142, C.sky) +
    person({ x: 70, skin: SKIN[0], hair: "short", shirt: C.green, legs: C.navy, right: [104, 108], scale: 0.9 }) +
    path("M150 104 L184 104 M172 92 L186 104 L172 116", "none", ` stroke="${C.green}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"`),
);
save(
  "meaning-toilet",
  ground(182) +
    rect(118, 40, 46, 70, C.white, 8, ` stroke="${C.greyMid}" stroke-width="4"`) +
    path("M44 110 L164 110 Q160 148 118 156 L118 178 L80 178 L80 156 Q48 148 44 110Z", C.white, ` stroke="${C.greyMid}" stroke-width="4"`) +
    ellipse(104, 110, 60, 10, C.greySoft, ` stroke="${C.greyMid}" stroke-width="4"`),
);
save(
  "meaning-stop",
  // a raised open hand
  path("M66 186 L66 110 Q66 98 76 98 Q86 98 86 110 L86 60 Q86 48 96 48 Q106 48 106 60 L106 50 Q106 38 116 38 Q126 38 126 50 L126 62 Q126 52 136 52 Q146 52 146 64 L146 132 Q146 160 124 186Z", SKIN[2]) +
    path("M86 110 L86 132 M106 60 L106 120 M126 62 L126 120", "none", ` stroke="${SKIN[3]}" stroke-width="3" stroke-linecap="round"`),
);
save(
  "meaning-danger",
  path("M100 22 L184 170 L16 170Z", C.yellow, ` stroke="${C.ink}" stroke-width="8" stroke-linejoin="round"`) +
    rect(92, 70, 16, 58, C.ink, 6) + circle(100, 146, 9, C.ink),
);
save(
  "meaning-open",
  ground() +
    rect(56, 26, 88, 154, C.wood) + rect(64, 34, 72, 146, C.ochreSoft) +
    path("M64 34 L36 46 L36 172 L64 180Z", C.wood) +
    path("M84 120 L120 120 M108 108 L120 120 L108 132", "none", ` stroke="${C.green}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`),
);
save(
  "meaning-closed",
  ground() +
    rect(56, 26, 88, 154, C.wood) + rect(64, 34, 72, 146, C.brown) +
    rect(80, 104, 40, 34, C.yellow, 5) + path("M88 104 L88 92 Q88 78 100 78 Q112 78 112 92 L112 104", "none", ` stroke="${C.yellow}" stroke-width="7"`) +
    circle(100, 120, 5, C.ink),
);

/* ------------------------------------------------------------------ */
/* Avatars and picture-PIN keys                                        */
/* ------------------------------------------------------------------ */

const disc = (bg: string, body: string) => circle(100, 100, 96, bg) + body;

save("avatar-protea", disc(C.greenSoft,
  Array.from({ length: 9 }, (_, i) => `<ellipse cx="100" cy="66" rx="13" ry="34" fill="${i % 2 ? "#F472B6" : "#EC4899"}" transform="rotate(${-80 + i * 20} 100 110)"/>`).join("") +
  circle(100, 112, 22, C.cream) + line(100, 134, 100, 186, C.green, 8)));
save("avatar-aloe", disc(C.ochreSoft,
  [-50, -28, -8, 8, 28, 50].map((a) => `<path d="M100 172 Q${100 + a} 110 ${100 + a * 1.4} 40 Q${100 + a * 0.6} 110 100 172Z" fill="${C.green}"/>`).join("") +
  rect(70, 160, 60, 26, C.terracotta, 6)));
save("avatar-baobab", disc(C.sky,
  path("M84 182 Q90 120 82 92 L118 92 Q110 120 116 182Z", C.wood) +
  [[60, 74], [82, 58], [110, 54], [138, 70], [100, 76]].map(([x, y]) => circle(x, y, 24, C.green)).join("") + rect(0, 178, 200, 20, C.ochreSoft)));
save("avatar-sun", disc(C.blueSoft,
  Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return line(100 + Math.cos(a) * 46, 100 + Math.sin(a) * 46, 100 + Math.cos(a) * 66, 100 + Math.sin(a) * 66, C.ochre, 8);
  }).join("") + circle(100, 100, 36, C.yellow)));
save("avatar-moon", disc(C.navy, path("M120 40 Q60 50 62 104 Q66 158 124 164 Q84 140 84 102 Q84 62 120 40Z", C.ochreSoft) + circle(140, 64, 4, C.white) + circle(150, 120, 3, C.white)));
save("avatar-star", disc(C.purple, path("M100 30 L120 78 L172 80 L132 112 L146 164 L100 134 L54 164 L68 112 L28 80 L80 78Z", C.yellow)));
save("avatar-bird", disc(C.terracottaSoft,
  ellipse(96, 112, 48, 34, C.blue) + circle(140, 84, 22, C.blue) + path("M160 82 L184 88 L160 94Z", C.ochre) + circle(146, 80, 4, C.white) +
  path("M70 108 Q96 66 122 106Z", C.navy) + path("M50 120 L20 110 L30 132Z", C.navy)));
save("avatar-cow", disc(C.greenSoft,
  ellipse(100, 108, 52, 56, C.white, ` stroke="${C.ink}" stroke-width="3"`) + ellipse(100, 140, 32, 22, C.terracottaSoft) +
  circle(88, 140, 4, C.ink) + circle(112, 140, 4, C.ink) + circle(82, 96, 6, C.ink) + circle(118, 96, 6, C.ink) +
  path("M58 64 Q40 40 50 30 Q62 50 72 60Z", C.greyMid) + path("M142 64 Q160 40 150 30 Q138 50 128 60Z", C.greyMid) + ellipse(122, 74, 14, 10, C.ink)));
save("avatar-fish", disc(C.blueSoft,
  ellipse(92, 100, 54, 32, C.ochre) + path("M140 100 L180 70 L180 130Z", C.ochre) + circle(64, 92, 6, C.white) + circle(64, 92, 3, C.ink) +
  path("M84 76 Q96 100 84 124 M104 74 Q116 100 104 126", "none", ` stroke="${C.terracotta}" stroke-width="4"`)));
save("avatar-drum", disc(C.ochreSoft,
  path("M58 62 L142 62 L124 120 L130 176 L70 176 L76 120Z", C.terracotta) + ellipse(100, 62, 42, 12, C.cream, ` stroke="${C.brown}" stroke-width="4"`) +
  path("M64 82 L136 108 M136 82 L64 108", "none", ` stroke="${C.ochre}" stroke-width="4"`)));
save("avatar-pot", disc(C.sky,
  ellipse(100, 120, 62, 52, C.ink) + rect(64, 60, 72, 14, C.ink, 6) + line(52, 172, 44, 186, C.ink, 7) + line(148, 172, 156, 186, C.ink, 7) + line(100, 172, 100, 188, C.ink, 7) +
  path("M80 54 Q74 40 82 28 M102 54 Q96 40 104 28 M122 54 Q116 40 124 28", "none", ` stroke="${C.greyMid}" stroke-width="4" stroke-linecap="round"`)));
save("avatar-mountain", disc(C.sky,
  path("M10 160 L60 74 L84 74 L94 66 L132 66 L150 80 L190 160Z", C.teal) + path("M60 74 L84 74 L94 66 L132 66 L150 80 L120 84 L96 78 L72 86Z", C.white) + rect(0, 156, 200, 44, C.blueSoft)));

const key = (body: string) => rect(6, 6, 188, 188, C.cream, 28) + body;
save("pin-tree", key(rect(90, 120, 20, 56, C.wood, 4) + circle(100, 82, 48, C.green) + circle(74, 108, 26, C.green) + circle(126, 108, 26, C.green)));
save("pin-house", key(rect(50, 96, 100, 80, C.ochreSoft, 2) + path("M36 100 L100 40 L164 100Z", C.terracotta) + rect(88, 130, 26, 46, C.wood, 3)));
save("pin-car", key(path("M28 132 L44 96 Q50 84 64 84 L136 84 Q150 84 156 96 L172 132Z", C.red) + rect(24, 124, 152, 32, C.red, 10) + rect(60, 94, 34, 26, C.sky, 3) + rect(104, 94, 34, 26, C.sky, 3) + circle(62, 158, 16, C.ink) + circle(138, 158, 16, C.ink)));
save("pin-cup", key(path("M48 60 L136 60 L126 160 Q124 172 112 172 L72 172 Q60 172 58 160Z", C.blue) + path("M134 82 Q170 82 168 110 Q166 136 130 134", "none", ` stroke="${C.blue}" stroke-width="12"`) + path("M74 46 Q68 34 76 24 M98 46 Q92 34 100 24", "none", ` stroke="${C.greyMid}" stroke-width="5" stroke-linecap="round"`)));
save("pin-flower", key(line(100, 110, 100, 180, C.green, 8) + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="100" cy="64" rx="18" ry="30" fill="${C.ochre}" transform="rotate(${a} 100 92)"/>`).join("") + circle(100, 92, 16, C.terracotta)));
save("pin-hat", key(ellipse(100, 140, 82, 20, C.navy) + path("M54 140 Q54 70 100 70 Q146 70 146 140Z", C.navy) + rect(54, 116, 92, 12, C.red)));
save("pin-key", key(circle(64, 100, 34, "none", ` stroke="${C.ochre}" stroke-width="14"`) + rect(94, 92, 84, 16, C.ochre, 6) + rect(150, 104, 12, 26, C.ochre, 3) + rect(130, 104, 12, 20, C.ochre, 3)));
save("pin-ball", key(circle(100, 100, 68, C.white, ` stroke="${C.ink}" stroke-width="5"`) + path("M100 66 L124 84 L116 112 L84 112 L76 84Z", C.ink) + path("M100 32 L100 66 M124 84 L160 74 M116 112 L134 144 M84 112 L66 144 M76 84 L40 74", "none", ` stroke="${C.ink}" stroke-width="5"`)));
save("pin-leaf", key(path("M40 160 Q40 50 160 40 Q150 160 40 160Z", C.green) + path("M40 160 Q90 100 150 50", "none", ` stroke="${C.greenSoft}" stroke-width="6" stroke-linecap="round"`)));

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

const medal = (colour: string, symbol: string) =>
  path("M70 120 L54 190 L80 176 L96 196 L104 128Z", C.blue) + path("M130 120 L146 190 L120 176 L104 196 L96 128Z", C.red) +
  circle(100, 86, 70, colour) + circle(100, 86, 58, C.white) + symbol;

save("badge-lesson", medal(C.green, poly([[68, 88], [92, 112], [134, 62]], C.green, 14)));
save("badge-hl-word", medal(C.teal, path("M58 58 L98 66 L98 122 L58 114Z", C.tealSoft) + path("M142 58 L102 66 L102 122 L142 114Z", C.tealSoft) + line(100, 66, 100, 122, C.teal, 4)));
save("badge-sounds", medal(C.ochre, path("M60 72 L76 72 L96 54 L96 118 L76 100 L60 100Z", C.ochre) + path("M110 70 Q122 86 110 102 M122 60 Q142 86 122 112", "none", ` stroke="${C.ochre}" stroke-width="7" stroke-linecap="round"`)));
save("badge-letters", medal(C.purple, `<g transform="rotate(40 100 86)">${rect(90, 34, 20, 84, C.ochre, 3)}${path("M90 118 L110 118 L100 140Z", C.cream)}${path("M96 132 L104 132 L100 140Z", C.ink)}${rect(90, 30, 20, 10, C.terracottaSoft, 3)}</g>`));
save("badge-word", medal(C.blue, rect(54, 60, 92, 52, C.blueSoft, 8) + text(100, 98, "cat", 30, C.navy)));
save("badge-sight", medal(C.navy, ellipse(100, 86, 40, 24, C.blueSoft) + circle(100, 86, 15, C.navy) + circle(106, 80, 5, C.white)));
save("badge-sentence", medal(C.terracotta, line(60, 64, 140, 64, C.terracotta, 8) + line(60, 86, 140, 86, C.terracotta, 8) + line(60, 108, 116, 108, C.terracotta, 8)));
save("badge-sms", medal(C.green, path("M58 56 L142 56 Q150 56 150 64 L150 104 Q150 112 142 112 L84 112 L66 126 L68 112 L58 112 Q50 112 50 104 L50 64 Q50 56 58 56Z", C.greenSoft) + line(66, 76, 132, 76, C.green, 5) + line(66, 92, 116, 92, C.green, 5)));
save("badge-reply", medal(C.teal, rect(52, 58, 96, 58, C.greySoft, 8) + [62, 80, 98, 116, 134].map((x) => rect(x - 6, 68, 12, 12, C.white, 2)).join("") + rect(66, 92, 68, 12, C.white, 2)));
save("badge-signs", medal(C.red, rect(94, 60, 12, 74, C.greyMid, 3) + path("M58 52 L132 52 L148 66 L132 80 L58 80Z", C.green) + path("M142 86 L68 86 L52 100 L68 114 L142 114Z", C.red)));
save("badge-notice", medal(C.wood, rect(56, 50, 88, 72, C.cream, 4, ` stroke="${C.wood}" stroke-width="5"`) + circle(100, 52, 5, C.red) + line(68, 72, 132, 72, C.greyMid, 5) + line(68, 88, 132, 88, C.greyMid, 5) + line(68, 104, 112, 104, C.greyMid, 5)));
save("badge-streak", medal(C.ochre, path("M100 40 Q130 72 124 100 Q120 126 100 128 Q78 128 76 104 Q74 84 92 66 Q92 82 100 86 Q106 66 100 40Z", C.terracotta) + path("M100 128 Q86 124 88 108 Q90 96 100 90 Q112 102 112 112 Q112 126 100 128Z", C.yellow)));

/* ------------------------------------------------------------------ */
/* App icon (also rasterised to PNG for the web app manifest)          */
/* ------------------------------------------------------------------ */

save(
  "app-icon",
  rect(0, 0, 200, 200, C.teal, 44) +
    path("M44 64 Q44 52 56 52 L96 58 L96 152 L56 146 Q44 144 44 132Z", C.cream) +
    path("M156 64 Q156 52 144 52 L104 58 L104 152 L144 146 Q156 144 156 132Z", C.ochreSoft) +
    path("M120 92 Q128 100 120 108 M130 84 Q144 100 130 116", "none", ` stroke="${C.teal}" stroke-width="6" stroke-linecap="round"`),
);

/** English descriptions for the asset manifest (facilitator and review tools). */
const ALT: Record<string, string> = {
  "cat": "A sitting orange cat",
  "sit": "A person sitting on a chair",
  "map": "A folded map with a route and a location pin",
  "pen": "A blue ballpoint pen",
  "pan": "A frying pan",
  "tin": "A food tin",
  "ten": "The number 10",
  "man": "A man standing",
  "dad": "A father holding a child's hand",
  "woman": "A woman wearing a headwrap",
  "sun": "The sun",
  "bus": "A bus",
  "tap": "A water tap with drops",
  "work": "A worker in a hard hat and safety vest holding a spanner",
  "me": "A person pointing at themself",
  "you": "A person pointing at the viewer",
  "clinic": "A clinic building with a green cross",
  "calendar": "A calendar page with the first day marked",
  "phone": "A mobile phone",
  "sms": "A mobile phone showing a text message",
  "airtime": "A phone with one signal bar and a coin with a down arrow (low airtime)",
  "bank": "A bank building",
  "shop": "A shop with a striped awning",
  "money": "Bank notes and coins",
  "id-book": "A green identity document book",
  "cleaner": "A cleaner holding a mop",
  "cook": "A cook in a chef's hat holding a pot",
  "driver": "A taxi driver at the wheel of a minibus",
  "ship": "A ship on the sea",
  "sheep": "A sheep",
  "milk": "A bottle and a glass of milk",
  "water": "A bucket of water",
  "dog": "A dog",
  "house": "A house",
  "bread": "A loaf of bread",
  "sign-stop": "A red STOP sign",
  "sign-exit": "A green EXIT sign",
  "sign-danger": "A DANGER sign",
  "sign-toilets": "A blue TOILETS sign",
  "sign-open": "A green OPEN sign",
  "sign-closed": "A red CLOSED sign",
  "meaning-exit": "A person walking out through a doorway",
  "meaning-toilet": "A toilet",
  "meaning-stop": "A raised open hand meaning stop",
  "meaning-danger": "A yellow warning triangle with an exclamation mark",
  "meaning-open": "An open door",
  "meaning-closed": "A closed door with a padlock",
  "avatar-protea": "A pink protea flower",
  "avatar-aloe": "An aloe plant in a pot",
  "avatar-baobab": "A baobab tree",
  "avatar-sun": "A sun",
  "avatar-moon": "A crescent moon at night",
  "avatar-star": "A yellow star",
  "avatar-bird": "A blue bird",
  "avatar-cow": "A cow's face",
  "avatar-fish": "An orange fish",
  "avatar-drum": "A drum",
  "avatar-pot": "A three-legged pot",
  "avatar-mountain": "A flat-topped mountain",
  "pin-tree": "A tree",
  "pin-house": "A house",
  "pin-car": "A red car",
  "pin-cup": "A cup",
  "pin-flower": "A flower",
  "pin-hat": "A hat",
  "pin-key": "A key",
  "pin-ball": "A ball",
  "pin-leaf": "A leaf",
  "badge-lesson": "Medal with a tick",
  "badge-hl-word": "Medal with an open book",
  "badge-sounds": "Medal with a speaker",
  "badge-letters": "Medal with a pencil",
  "badge-word": "Medal with a word card",
  "badge-sight": "Medal with an eye",
  "badge-sentence": "Medal with lines of text",
  "badge-sms": "Medal with a message bubble",
  "badge-reply": "Medal with a keyboard",
  "badge-signs": "Medal with a signpost",
  "badge-notice": "Medal with a notice board",
  "badge-streak": "Medal with a flame",
  "app-icon": "App icon: an open book with sound waves",
};

mkdirSync(OUT, { recursive: true });
for (const [id, svg] of images) writeFileSync(join(OUT, `${id}.svg`), svg + "\n");

const manifest = {
  $schema: "./schema/images.schema.json",
  images: [...images.keys()].sort().map((id) => {
    if (!ALT[id]) throw new Error(`missing description for image '${id}'`);
    return {
      id,
      file: `images/${id}.svg`,
      alt: ALT[id],
      author: "Yomu project contributors",
      license: "MIT (repository licence)",
      source: "Original artwork drawn in code: scripts/illustrations/draw.ts",
      created: "2026-10-26",
    };
  }),
};
writeFileSync(join(process.cwd(), "content", "images.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${images.size} illustrations to ${OUT} and content/images.json`);
