/**
 * Rasterises public/images/app-icon.svg into the PNG icons the web app
 * manifest needs (Android requires PNG for installation).
 *
 *   npx tsx scripts/illustrations/icons.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const svg = readFileSync(
  join(root, "public", "images", "app-icon.svg"),
  "utf8",
);
const sizes: [string, number, boolean][] = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, maskable] of sizes) {
    // Maskable icons keep the artwork inside the 80% safe zone on a full-bleed background.
    const inner = maskable ? Math.round(size * 0.8) : size;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:${maskable ? "#0F766E" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${inner}" height="${inner}"></body></html>`,
    );
    await page.screenshot({
      path: join(root, "public", "icons", name),
      omitBackground: !maskable,
    });
  }
  await browser.close();
  console.log("wrote public/icons/*.png");
}

void main();
