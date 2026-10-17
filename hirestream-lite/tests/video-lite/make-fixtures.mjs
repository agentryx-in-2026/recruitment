// Generates the clearly-marked SAMPLE documents the films upload.
// node tests/video-lite/make-fixtures.mjs
import { chromium } from "playwright";
import path from "node:path";
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
const DOCS = [
  ["appointment-letter", "Appointment Letter", "Offer of employment — Heavy Truck Driver, Emirates Transport, Dubai"],
  ["passport", "Passport (copy)", "Bio-data page — Republic of India"],
  ["police-clearance", "Police Clearance Certificate", "Issued by the Regional Passport Office, Shimla"],
  ["medical-certificate", "Medical Fitness Certificate", "GAMCA-approved medical centre — FIT"],
  ["identity-proof", "Identity Proof", "Aadhaar card (masked)"],
  ["education-certificate", "Education Certificate", "Board / ITI certificate"],
  ["experience-certificate", "Experience Certificate", "Previous employer letter"],
  ["nursing-registration", "Nursing Council Registration", "HP Nurses Registration Council"],
  ["nursing-certificate", "Nursing Qualification", "GNM / B.Sc. Nursing certificate"],
  ["driving-licence", "Driving Licence", "Heavy vehicle licence"],
];
const b = await chromium.launch();
const p = await b.newPage();
for (const [file, title, sub] of DOCS) {
  await p.setContent(`<html><body style="font-family:Arial;margin:60px;border:6px double #1e3a8a;padding:50px;min-height:900px;position:relative">
    <div style="font-size:14px;letter-spacing:3px;color:#64748b">HIRESTREAM DEMONSTRATION FILE</div>
    <h1 style="color:#1e3a8a;font-size:40px;margin:20px 0 6px">${title}</h1>
    <div style="font-size:18px;color:#334155">${sub}</div>
    <div style="position:absolute;top:380px;left:0;right:0;text-align:center;font-size:110px;font-weight:800;color:rgba(220,38,38,.18);transform:rotate(-24deg)">SAMPLE</div>
    <p style="margin-top:420px;font-size:14px;color:#64748b">This is a sample file used to record the HireStream walkthrough videos. It is not a real document.</p>
  </body></html>`);
  await p.pdf({ path: path.join(DIR, `${file}.pdf`), format: "A4" });
}
await b.close();
console.log("fixtures written to", DIR);
