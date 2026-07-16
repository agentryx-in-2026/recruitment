// One-shot helper: render an HTML file to an A4 PDF via Playwright Chromium.
// Used to produce the Agentryx Project Profile PDF from its HTML source.
// Usage: node scripts/render-profile-pdf.mjs <input.html> <output.pdf>

import { chromium } from "playwright";
import path from "path";

const HTML = path.resolve(process.argv[2]);
const PDF  = path.resolve(process.argv[3]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + HTML, { waitUntil: "networkidle" });
  await page.pdf({
    path: PDF,
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log("ok ->", PDF);
})();
