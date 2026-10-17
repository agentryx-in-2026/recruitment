// Build the three hirestream-lite user guides: source fragments → styled HTML
// (with a generated contents list) → A4 PDF via headless Chromium.
//   node tests/video-lite/build-guides.mjs
// Sources:  A.PMD/User Guides and Videos - Lite/source/*.html  (content only)
// Images:   A.PMD/User Guides and Videos - Lite/images/        (from the films' snap())
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = "A.PMD/User Guides and Videos - Lite";
const SRC = path.join(ROOT, "source");
const VERSION = fs.readFileSync("VERSION", "utf8").trim();
const ISSUED = process.env.GUIDE_DATE || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const GUIDES = [
  { src: "applicant.html", out: "01_Applicant_User_Guide", title: "Applicant User Guide", sub: "Registering, applying and preparing to travel", audience: "Candidates seeking overseas employment through HPSEDC" },
  { src: "agency.html", out: "02_HPSEDC_Super_Agency_User_Guide", title: "HPSEDC as Super Agency — User Guide", sub: "Day-to-day recruitment operations of the Overseas Placement Cell", audience: "HPSEDC Overseas Placement Cell staff" },
  { src: "admin.html", out: "03_Admin_User_Guide", title: "Admin User Guide", sub: "Oversight, configuration and compliance", audience: "HPSEDC administrators and system administrators" },
];

const CSS = `
:root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--brand:#1e3a8a;--brand2:#2563eb;--ok:#047857;--warn:#b45309;--bad:#b91c1c;--soft:#f1f5f9}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#f8fafc;color:var(--ink);font:15px/1.6 "Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari",Helvetica,Arial,sans-serif}
main{max-width:900px;margin:0 auto;background:#fff;padding:0 56px 64px}
.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:64px 56px;margin:0 -56px 40px;
  background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#065f46 100%);color:#fff;break-after:page}
.cover .kicker{letter-spacing:3px;text-transform:uppercase;font-size:13px;opacity:.75}
.cover h1{font-size:44px;line-height:1.15;margin:0}
.cover .sub{font-size:20px;opacity:.9;max-width:640px}
.cover dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin-top:40px;font-size:14px;opacity:.9}
.cover dt{opacity:.7}.cover dd{margin:0}
.cover .tricolour{display:flex;gap:6px;margin:6px 0 10px}.cover .tricolour span{width:42px;height:5px;border-radius:3px}
nav.toc{break-after:page;padding-top:24px}
nav.toc h2{border:0;margin-top:0}
nav.toc ol{padding-left:22px;columns:1}
nav.toc li{margin:4px 0}
nav.toc a{color:var(--ink);text-decoration:none}
nav.toc a:hover{color:var(--brand2)}
h2{font-size:26px;color:var(--brand);border-bottom:3px solid var(--brand);padding-bottom:6px;margin:48px 0 16px;break-after:avoid}
h2 .num{display:inline-block;min-width:38px;color:var(--brand2)}
h3{font-size:19px;margin:28px 0 8px;color:#1e293b;break-after:avoid}
h4{font-size:16px;margin:18px 0 6px;break-after:avoid}
p{margin:8px 0}
a{color:var(--brand2)}
ol,ul{padding-left:24px}li{margin:3px 0}
figure{margin:18px 0 22px;break-inside:avoid;text-align:center}
figure img{width:100%;max-height:200mm;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:10px;box-shadow:0 4px 18px rgba(15,23,42,.08)}
figcaption{font-size:13px;color:var(--muted);margin-top:6px}
table{border-collapse:collapse;width:100%;margin:12px 0 18px;font-size:14px;break-inside:auto}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:600}
tr{break-inside:avoid}
.box{border-radius:10px;padding:12px 16px;margin:14px 0;border:1px solid;break-inside:avoid}
.box b:first-child{display:block;margin-bottom:2px}
.tip{background:#eff6ff;border-color:#bfdbfe}
.warn{background:#fffbeb;border-color:#fde68a}
.danger{background:#fef2f2;border-color:#fecaca}
.ok{background:#ecfdf5;border-color:#a7f3d0}
kbd,.ui{font:600 13px/1 "Segoe UI",Roboto,sans-serif;background:var(--soft);border:1px solid #cbd5e1;border-radius:6px;padding:2px 7px;white-space:nowrap}
.steps{counter-reset:s;list-style:none;padding-left:0}
.steps>li{counter-increment:s;position:relative;padding-left:40px;margin:10px 0}
.steps>li::before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--brand2);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
.flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
.flow span{background:var(--soft);border:1px solid #cbd5e1;border-radius:999px;padding:4px 12px;font-weight:600;font-size:14px}
.flow i{color:var(--muted);font-style:normal}
footer.doc{margin-top:56px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media print{body{background:#fff}main{max-width:none;padding:0}.cover{margin:0;min-height:0;height:255mm}}
@media (max-width:640px){main{padding:0 16px 40px}.cover{margin:0 -16px 32px;padding:48px 16px}.cover h1{font-size:32px}}
`;

function slug(s) { return s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function render(g) {
  let body = fs.readFileSync(path.join(SRC, g.src), "utf8");
  const toc = [];
  let n = 0;
  body = body.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, t) => {
    n++; const id = slug(t); toc.push({ n, id, t });
    return `<h2 id="${id}"><span class="num">${n}.</span>${t}</h2>`;
  });
  const tocHtml = `<nav class="toc"><h2>Contents</h2><ol>${toc.map((x) => `<li><a href="#${x.id}">${x.t}</a></li>`).join("")}</ol></nav>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${g.title} — HireStream</title><style>${CSS}</style></head><body><main>
<section class="cover">
  <div class="kicker">HPSEDC · Government of Himachal Pradesh</div>
  <div class="tricolour"><span style="background:#f97316"></span><span style="background:#fff"></span><span style="background:#16a34a"></span></div>
  <h1>HireStream<br>${g.title}</h1>
  <div class="sub">${g.sub}</div>
  <dl><dt>Portal</dt><dd>HireStream — HPSEDC Overseas Placement Portal</dd>
      <dt>For</dt><dd>${g.audience}</dd>
      <dt>Release</dt><dd>HireStream Lite v${VERSION}</dd>
      <dt>Issued</dt><dd>${ISSUED}</dd></dl>
</section>
${tocHtml}
${body}
<footer class="doc">HireStream — ${g.title} · HireStream Lite v${VERSION} · ${ISSUED}. Screens shown are from the current release; sample names and data are fictitious.</footer>
</main></body></html>`;
}

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const page = await browser.newPage();
for (const g of GUIDES) {
  if (!fs.existsSync(path.join(SRC, g.src))) { console.log("skip", g.src); continue; }
  const htmlPath = path.resolve(ROOT, `${g.out}.html`);
  fs.writeFileSync(htmlPath, render(g));
  await page.goto("file://" + htmlPath, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")));
  if (missing.length) console.log(`  ! ${g.out}: missing images`, missing);
  await page.pdf({
    path: path.resolve(ROOT, `${g.out}.pdf`), format: "A4", printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;padding:0 14mm;text-align:right">HireStream — ${g.title}</div>`,
    footerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>HPSEDC · HireStream Lite v${VERSION}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log(`built ${g.out}.html + .pdf`);
}
await browser.close();
