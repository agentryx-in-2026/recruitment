import "dotenv/config";
import { createRequire } from "node:module";
import { storage } from "../server/storage";
import {
  documents, agencyDocuments, employerDocuments, placements, applications,
  candidates, recruitmentAgents, employers, users, jobs, candidateEducation, candidateExperience,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

/**
 * Generate real-looking SAMPLE documents for every fileUrl referenced by the
 * demo seed (candidate / agency / employer docs + appointment letters), so the
 * verification & document screens preview actual PDFs. Official government-ID
 * mimics carry a faint "SPECIMEN — DEMO ONLY" mark; letters/CVs/contracts look
 * fully real. Run AFTER scripts/seed.ts.
 */
const require = createRequire("/home/subhash.thakur.india/Projects/Recruitment/hirestream/package.json");
const { chromium } = require("playwright");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const diskPath = (fileUrl: string) => path.join(UPLOAD_DIR, fileUrl.replace(/^\/uploads\//, "").split("?")[0]);
const photoB64 = (photoUrl?: string | null) => {
  if (!photoUrl) return "";
  try { return "data:image/jpeg;base64," + fs.readFileSync(diskPath(photoUrl)).toString("base64"); } catch { return ""; }
};
const fmtDate = (d?: any) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

// per-candidate supplemental facts (DOB / place) keyed by username — matches the seed CANDS
const DOB: Record<string, { dob: string; pob: string }> = {
  arjun_thakur: { dob: "12 Mar 1996", pob: "Shimla, HP" }, priya_verma: { dob: "08 Jul 1997", pob: "Manali, HP" },
  rohit_sharma: { dob: "20 Nov 1995", pob: "Mandi, HP" }, neha_chauhan: { dob: "14 Feb 1998", pob: "Bilaspur, HP" },
  karan_rana: { dob: "05 Sep 1994", pob: "Una, HP" }, meera_iyer: { dob: "22 May 1999", pob: "Solan, HP" },
  vikram_negi: { dob: "01 Dec 1993", pob: "Kullu, HP" }, ananya_bhatt: { dob: "30 Aug 1998", pob: "Chamba, HP" },
  aman_kapoor: { dob: "18 Jun 1996", pob: "Hamirpur, HP" }, sahil_verma: { dob: "25 Jan 1997", pob: "Kangra, HP" },
};

const NAVY = "#0b3d6b", GOLD = "#b8860b", INK = "#1c2733";
const CSS = `
  *{box-sizing:border-box;} @page{size:A4;margin:0;}
  body{font-family:Georgia,'Times New Roman',serif;color:${INK};margin:0;}
  .page{position:relative;width:210mm;min-height:297mm;padding:18mm 18mm 16mm;overflow:hidden;}
  .specimen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;}
  .specimen span{font-family:Arial,sans-serif;font-size:62pt;font-weight:800;color:rgba(180,30,30,.10);transform:rotate(-30deg);letter-spacing:8px;border:6px solid rgba(180,30,30,.10);padding:10px 40px;border-radius:14px;}
  .lh{display:flex;align-items:center;gap:14px;border-bottom:3px solid ${NAVY};padding-bottom:10px;}
  .lh .emblem{width:54px;height:54px;border-radius:50%;background:${NAVY};color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;text-align:center;line-height:1.05;}
  .lh .org{flex:1;} .lh .org .t{font-size:15pt;font-weight:700;color:${NAVY};font-family:Arial,sans-serif;}
  .lh .org .s{font-size:9pt;color:#5a6b7b;font-family:Arial,sans-serif;}
  .lh .ref{text-align:right;font-size:8.5pt;color:#5a6b7b;font-family:Arial,sans-serif;}
  h1{font-family:Arial,sans-serif;font-size:15pt;color:${NAVY};text-align:center;margin:16px 0 4px;letter-spacing:.5px;}
  .sub{text-align:center;font-size:9.5pt;color:#5a6b7b;font-family:Arial,sans-serif;margin-bottom:14px;}
  p{font-size:10.5pt;line-height:1.6;margin:8px 0;} .small{font-size:9pt;color:#5a6b7b;}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10pt;}
  td,th{border:1px solid #c9d3de;padding:6px 9px;text-align:left;vertical-align:top;}
  th{background:#eef3f8;font-family:Arial,sans-serif;color:${NAVY};font-size:9pt;}
  .kv td:first-child{width:34%;font-weight:700;color:#33414f;background:#f6f9fc;}
  .sign{margin-top:42px;display:flex;justify-content:space-between;align-items:flex-end;}
  .sign .seal{width:96px;height:96px;border:2px dashed ${GOLD};border-radius:50%;color:${GOLD};font-family:Arial,sans-serif;font-size:7.5pt;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.15;opacity:.85;}
  .sign .who{text-align:right;font-size:9.5pt;} .sign .who .line{border-top:1px solid #33414f;width:200px;margin-bottom:4px;}
  .foot{position:absolute;left:18mm;right:18mm;bottom:9mm;border-top:1px solid #c9d3de;padding-top:6px;font-size:7.5pt;color:#8a97a4;font-family:Arial,sans-serif;display:flex;justify-content:space-between;}
  .card{border:2px solid ${NAVY};border-radius:10px;padding:14px 16px;margin-top:10px;background:linear-gradient(135deg,#fbfdff,#eef3f8);}
  .photo{width:34mm;height:42mm;object-fit:cover;border:1px solid #8a97a4;background:#dfe7ef;}
  .flex{display:flex;gap:16px;} .flex>div{flex:1;}
`;
const emblem = (txt: string) => `<div class="emblem">${txt}</div>`;
function pageHtml(o: { specimen?: boolean; org: string; orgSub: string; emblemTxt: string; ref: string; bodyHtml: string; footL: string }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">
    ${o.specimen ? `<div class="specimen"><span>SPECIMEN</span></div>` : ""}
    <div class="lh">${emblem(o.emblemTxt)}<div class="org"><div class="t">${o.org}</div><div class="s">${o.orgSub}</div></div><div class="ref">${o.ref}</div></div>
    ${o.bodyHtml}
    <div class="foot"><span>${o.footL}</span><span>SAMPLE DOCUMENT · Generated for HPSEDC demonstration · Not a genuine record</span></div>
  </div></body></html>`;
}
const signBlock = (name: string, role: string, sealTxt: string) =>
  `<div class="sign"><div class="seal">${sealTxt}</div><div class="who"><div class="line"></div>${name}<br><span class="small">${role}</span></div></div>`;

// ── Candidate templates ──────────────────────────────────────────────
function cvDoc(c: any, edu: any[], exp: any[]) {
  const eduRows = edu.map((e) => `<tr><td>${e.degree}</td><td>${e.institution}</td><td>${e.year}</td><td>${e.percentage}%</td></tr>`).join("");
  const expRows = exp.map((e) => `<tr><td>${e.role}</td><td>${e.company}</td><td>${e.years} yr</td><td>${e.country || "India"}</td></tr>`).join("");
  return pageHtml({
    org: "Curriculum Vitae", orgSub: "HireStream — HPSEDC Overseas Placement Portal", emblemTxt: "C V", ref: `Ref: HS/CV/${(c.passportNumber || "").slice(-5)}`,
    footL: c.fullName,
    bodyHtml: `
      <div class="flex" style="margin-top:14px;">
        <div style="flex:0 0 34mm;">${c.photoB64 ? `<img class="photo" src="${c.photoB64}">` : ""}</div>
        <div style="flex:1;">
          <h1 style="text-align:left;margin:0;">${c.fullName}</h1>
          <p class="small" style="margin:2px 0 8px;">${c.location} · ${c.phone || ""} · ${c.email}</p>
          <table class="kv"><tr><td>Passport No.</td><td>${c.passportNumber || "—"} (${(c.ecrStatus || "").toUpperCase()})</td></tr>
          <tr><td>English (IELTS)</td><td>${c.ieltsBand || "—"}</td></tr>
          <tr><td>Experience</td><td>${c.experience} years</td></tr>
          <tr><td>Preferred</td><td>${(c.preferredCountries || []).join(", ")}</td></tr></table>
        </div>
      </div>
      <p style="font-family:Arial,sans-serif;font-weight:700;color:${NAVY};margin-top:14px;">Key Skills</p>
      <p>${(c.skills || []).join(" · ")}</p>
      <p style="font-family:Arial,sans-serif;font-weight:700;color:${NAVY};margin-top:10px;">Education</p>
      <table><tr><th>Qualification</th><th>Institution</th><th>Year</th><th>Score</th></tr>${eduRows}</table>
      <p style="font-family:Arial,sans-serif;font-weight:700;color:${NAVY};margin-top:10px;">Work Experience</p>
      <table><tr><th>Role</th><th>Employer</th><th>Duration</th><th>Country</th></tr>${expRows}</table>
      <p class="small" style="margin-top:14px;">I hereby declare that the information above is true to the best of my knowledge.</p>
      <p>${c.fullName}</p>`,
  });
}
function passportDoc(c: any, foreign?: { country: string; flagTxt: string }) {
  const d = DOB[c.username] || { dob: "—", pob: "—" };
  const nat = foreign ? foreign.country.toUpperCase() : "INDIAN";
  return pageHtml({
    specimen: true, org: foreign ? `${foreign.country} — Passport` : "Republic of India — Passport", orgSub: foreign ? "Machine Readable Passport" : "भारत गणराज्य · Machine Readable Passport",
    emblemTxt: foreign ? foreign.flagTxt : "भारत", ref: `Type P`,
    footL: c.fullName,
    bodyHtml: `<div class="card"><div class="flex">
      <div style="flex:0 0 34mm;">${c.photoB64 ? `<img class="photo" src="${c.photoB64}">` : `<div class="photo"></div>`}</div>
      <div style="flex:1;"><table class="kv">
        <tr><td>Passport No.</td><td><b>${c.passportNumber || "P0000000"}</b></td></tr>
        <tr><td>Surname / Given</td><td>${c.fullName}</td></tr>
        <tr><td>Nationality</td><td>${nat}</td></tr>
        <tr><td>Date of Birth</td><td>${d.dob}</td></tr>
        <tr><td>Place of Birth</td><td>${d.pob}</td></tr>
        <tr><td>Sex</td><td>${["priya_verma","neha_chauhan","meera_iyer","ananya_bhatt"].includes(c.username) ? "F" : "M"}</td></tr>
        <tr><td>Date of Expiry</td><td>${fmtDate(c.passportExpiry)}</td></tr>
        <tr><td>Status</td><td>${(c.ecrStatus || "ecr").toUpperCase()}</td></tr>
      </table></div></div>
      <p class="small" style="margin-top:10px;font-family:monospace;">P&lt;IND${(c.fullName||"").toUpperCase().replace(/[^A-Z]/g,"&lt;")}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br>${(c.passportNumber||"P0000000")}&lt;IND${d.dob.replace(/\D/g,"").slice(-6)}</p>
    </div>`,
  });
}
function aadhaarDoc(c: any) {
  const d = DOB[c.username] || { dob: "—", pob: "—" };
  return pageHtml({
    specimen: true, org: "Government of India", orgSub: "Unique Identification Authority of India (Aadhaar)", emblemTxt: "आधार", ref: "",
    footL: c.fullName,
    bodyHtml: `<div class="card" style="max-width:120mm;"><div class="flex">
      <div style="flex:0 0 30mm;">${c.photoB64 ? `<img class="photo" style="height:38mm;width:30mm;" src="${c.photoB64}">` : `<div class="photo"></div>`}</div>
      <div style="flex:1;"><table class="kv">
        <tr><td>Name</td><td>${c.fullName}</td></tr>
        <tr><td>DOB</td><td>${d.dob}</td></tr>
        <tr><td>Gender</td><td>${["priya_verma","neha_chauhan","meera_iyer","ananya_bhatt"].includes(c.username) ? "Female" : "Male"}</td></tr>
        <tr><td>Address</td><td>${c.addressLine1 || ""}, ${c.city || ""}, Himachal Pradesh - ${c.pinCode || ""}</td></tr>
      </table>
      <p style="font-size:15pt;letter-spacing:4px;font-family:monospace;margin-top:8px;">XXXX XXXX ${(c.passportNumber||"0000").slice(-4)}</p></div>
      <div style="flex:0 0 26mm;"><div style="width:26mm;height:26mm;border:1px solid #333;background:repeating-linear-gradient(45deg,#000,#000 2px,#fff 2px,#fff 4px);"></div><p class="small" style="text-align:center;">Scan QR</p></div>
    </div></div>
    <p class="small" style="margin-top:14px;">Aadhaar is proof of identity, not of citizenship. This is a demonstration specimen.</p>`,
  });
}
function certificateDoc(c: any, e: any) {
  return pageHtml({
    org: e?.institution || "Board of Technical Education", orgSub: "Himachal Pradesh", emblemTxt: "EDU", ref: `Serial: ${(c.passportNumber||"").slice(-6)}`,
    footL: c.fullName,
    bodyHtml: `<h1>Certificate of ${e?.degree?.includes("ITI") || e?.degree?.includes("Diploma") ? "Training" : "Qualification"}</h1>
      <div class="sub">This is to certify that</div>
      <p style="text-align:center;font-size:16pt;font-weight:700;color:${NAVY};">${c.fullName}</p>
      <p style="text-align:center;">son/daughter of ${c.fatherName || "—"}, has successfully completed / passed</p>
      <p style="text-align:center;font-size:13pt;font-weight:700;">${e?.degree || "the prescribed course"}</p>
      <p style="text-align:center;">from <b>${e?.institution || "—"}</b> in the year <b>${e?.year || "—"}</b>,<br>securing <b>${e?.percentage || "—"}%</b> marks, and is hereby awarded this certificate.</p>
      ${signBlock("Controller of Examinations", e?.institution || "", "OFFICIAL<br>SEAL")}`,
  });
}

// ── Agency templates ─────────────────────────────────────────────────
const AGENCY_TITLES: Record<string, string> = {
  mea_recruiting_licence: "Recruiting Agent Licence", incorporation_certificate: "Certificate of Incorporation",
  pan_card: "Permanent Account Number (PAN)", gst_certificate: "GST Registration Certificate",
  office_address_proof: "Office Address Proof", authorised_signatory_id: "Authorised Signatory — Identity Proof",
  labour_recruitment_permission: "Labour / Recruitment Permission", past_placement_experience: "Record of Past Overseas Placements",
  hpsedc_undertaking: "Recruitment Undertaking with HPSEDC",
};
function agencyDoc(type: string, a: any) {
  const ref = `Ref: ${a.licenseNumber || "B-XXXX"}`;
  const sign = signBlock(a.authorisedSignatoryName || "Authorised Signatory", `${a.authorisedSignatoryDesignation || ""}, ${a.agencyName}`, "AGENCY<br>SEAL");
  if (type === "mea_recruiting_licence")
    return pageHtml({ specimen: true, org: "Ministry of External Affairs", orgSub: "Protector General of Emigrants — Recruiting Agent Licence", emblemTxt: "MEA", ref, footL: a.agencyName,
      bodyHtml: `<h1>Recruiting Agent Licence</h1><div class="sub">Issued under the Emigration Act, 1983</div>
      <table class="kv"><tr><td>Agency</td><td><b>${a.agencyName}</b></td></tr><tr><td>Licence No.</td><td>${a.licenseNumber}</td></tr>
      <tr><td>Valid up to</td><td>${fmtDate(a.meaLicenseExpiry)}</td></tr><tr><td>Registered Office</td><td>${a.registeredCity || ""}, ${a.registeredState || "Himachal Pradesh"}</td></tr>
      <tr><td>Authorised Signatory</td><td>${a.authorisedSignatoryName || "—"}</td></tr></table>
      <p>This licence authorises the above agency to recruit Indian citizens for overseas employment, subject to the conditions of the Emigration Act, 1983 and rules thereunder.</p>${sign}` });
  if (type === "pan_card")
    return pageHtml({ specimen: true, org: "Income Tax Department", orgSub: "Government of India — Permanent Account Number", emblemTxt: "PAN", ref: "", footL: a.agencyName,
      bodyHtml: `<div class="card" style="max-width:120mm;"><table class="kv"><tr><td>Name</td><td>${a.agencyName}</td></tr>
      <tr><td>PAN</td><td style="font-family:monospace;font-size:13pt;">AAACH${(a.licenseNumber||"0000").replace(/\D/g,"").slice(-4)}Q</td></tr>
      <tr><td>Type</td><td>Company</td></tr></table></div>` });
  // generic official letter/certificate
  return pageHtml({ org: a.agencyName, orgSub: "Licensed Overseas Recruiting Agency", emblemTxt: "RA", ref, footL: a.agencyName,
    bodyHtml: `<h1>${AGENCY_TITLES[type] || "Official Document"}</h1>
      <table class="kv"><tr><td>Agency</td><td>${a.agencyName}</td></tr><tr><td>Licence No.</td><td>${a.licenseNumber}</td></tr>
      <tr><td>Registered Office</td><td>${a.registeredCity || ""}, ${a.registeredState || "Himachal Pradesh"} - ${a.registeredPinCode || ""}</td></tr></table>
      <p>${docBody(type, a.agencyName)}</p>${sign}` });
}
function docBody(type: string, name: string) {
  switch (type) {
    case "incorporation_certificate": return `This is to certify that <b>${name}</b> is incorporated under the Companies Act, 2013, and that the company is registered as a private limited company on the date mentioned herein.`;
    case "gst_certificate": return `This is to certify that <b>${name}</b> is registered under the Goods and Services Tax Act with a valid GSTIN, effective from the date of registration.`;
    case "office_address_proof": return `This document evidences the registered office address of <b>${name}</b> as recorded with the licensing authority (electricity bill / registered lease enclosed).`;
    case "labour_recruitment_permission": return `Permission is hereby granted to <b>${name}</b> by the competent labour authority to undertake recruitment activities for overseas employment, subject to applicable rules.`;
    case "past_placement_experience": return `This record summarises the overseas placements successfully completed by <b>${name}</b> over the preceding years, evidencing the agency's experience and standing.`;
    case "hpsedc_undertaking": return `<b>${name}</b> hereby undertakes to abide by the terms, code of conduct, and welfare obligations prescribed by HPSEDC for overseas recruitment, including the mandatory post-placement welfare check-ins.`;
    default: return `Official document issued by ${name}.`;
  }
}

// ── Employer templates ───────────────────────────────────────────────
function employerDoc(type: string, e: any) {
  const ref = `Ref: ${(e.companyName||"EMP").split(" ")[0].toUpperCase()}/${new Date().getFullYear()}`;
  const sign = signBlock(e.authorisedSignatoryName || "Authorised Signatory", `${e.authorisedSignatoryDesignation || ""}, ${e.companyName}`, "COMPANY<br>SEAL");
  const flag = (e.registeredCountry || "").includes("Japan") ? "日本" : (e.registeredCountry || "").includes("Qatar") ? "قطر" : "UAE";
  if (type === "signatory_passport")
    return passportDoc({ username: "_emp", fullName: e.authorisedSignatoryName || "Authorised Signatory", passportNumber: e.authorisedSignatoryIdNumber, ecrStatus: "—", passportExpiry: null, photoB64: "" }, { country: e.registeredCountry || "Overseas", flagTxt: flag });
  if (type === "demand_letter")
    return pageHtml({ org: e.companyName, orgSub: `${e.location} · Foreign Principal Employer`, emblemTxt: flag, ref, footL: e.companyName,
      bodyHtml: `<h1>Manpower Demand Letter</h1><p>To the Recruiting Agent / HPSEDC,</p>
      <p>We, <b>${e.companyName}</b>, registered in ${e.registeredCountry}, hereby request the recruitment of skilled and semi-skilled Indian workers for deployment at our project sites. The categories, numbers and terms are as per the attached schedule. We confirm provision of accommodation, transport and statutory benefits as per the host-country labour law.</p>
      <table class="kv"><tr><td>Principal Employer</td><td>${e.companyName}</td></tr><tr><td>Country</td><td>${e.registeredCountry}</td></tr><tr><td>Authorised Signatory</td><td>${e.authorisedSignatoryName}</td></tr></table>${sign}` });
  if (type === "power_of_attorney")
    return pageHtml({ org: e.companyName, orgSub: `${e.location}`, emblemTxt: flag, ref, footL: e.companyName,
      bodyHtml: `<h1>Power of Attorney</h1><p>Know all by these presents that <b>${e.companyName}</b> (the Principal) hereby authorises its appointed Indian recruiting agent to act on its behalf for the selection, processing and deployment of workers, including signing of employment contracts and liaison with HPSEDC and the Protector of Emigrants.</p>
      <p>This authority is granted in good faith and remains valid until revoked in writing.</p>${sign}` });
  if (type === "employment_contract")
    return pageHtml({ org: e.companyName, orgSub: "Standard Overseas Employment Contract", emblemTxt: flag, ref, footL: e.companyName,
      bodyHtml: `<h1>Employment Contract</h1>
      <table class="kv"><tr><td>Employer</td><td>${e.companyName}, ${e.registeredCountry}</td></tr><tr><td>Working Hours</td><td>8 hours/day, 6 days/week</td></tr>
      <tr><td>Accommodation</td><td>Provided by employer</td></tr><tr><td>Air Passage</td><td>To & fro, employer-borne</td></tr>
      <tr><td>Medical</td><td>As per host-country law</td></tr><tr><td>Contract Term</td><td>2 years, renewable</td></tr></table>
      <p>The worker shall be employed on the terms above, in accordance with the labour law of ${e.registeredCountry} and the Emigration Act, 1983. Wages shall be paid monthly into the worker's account.</p>${sign}` });
  // business_registration
  return pageHtml({ specimen: true, org: e.registeredCountry || "Trade Authority", orgSub: "Commercial Registration / Trade Licence", emblemTxt: flag, ref, footL: e.companyName,
    bodyHtml: `<h1>Certificate of Business Registration</h1>
    <table class="kv"><tr><td>Company</td><td><b>${e.companyName}</b></td></tr><tr><td>Country</td><td>${e.registeredCountry}</td></tr>
    <tr><td>Industry</td><td>${e.industry || "—"}</td></tr><tr><td>Registered Office</td><td>${e.location}</td></tr></table>
    <p>This certifies that the above entity is duly registered to carry on business in ${e.registeredCountry}.</p>${signBlock("Registrar of Companies", e.registeredCountry || "", "TRADE<br>SEAL")}` });
}

function appointmentDoc(cand: any, job: any, p: any) {
  return pageHtml({
    org: job?.company || "Overseas Employer", orgSub: "Letter of Appointment", emblemTxt: "OFR", ref: `Ref: OFR/${new Date().getFullYear()}/${(cand.passportNumber||"").slice(-4)}`,
    footL: cand.fullName,
    bodyHtml: `<h1>Letter of Appointment</h1><p>Date: ${fmtDate(p.startDate) || fmtDate(new Date())}</p>
      <p>Dear <b>${cand.fullName}</b>,</p>
      <p>We are pleased to offer you the position of <b>${job?.title || "—"}</b> at ${job?.company || ""}, ${p.country}. Your appointment is subject to visa approval and pre-departure formalities coordinated by your recruiting agency under HPSEDC supervision.</p>
      <table class="kv"><tr><td>Position</td><td>${job?.title || "—"}</td></tr><tr><td>Location</td><td>${job?.location || p.country}</td></tr>
      <tr><td>Monthly Salary</td><td>${p.salary || job?.salary || "—"}</td></tr><tr><td>Proposed Start</td><td>${fmtDate(p.startDate)}</td></tr>
      <tr><td>Contract</td><td>2 years, renewable</td></tr></table>
      <p>We look forward to welcoming you. Please sign and return a copy in acceptance.</p>
      ${signBlock("HR Department", job?.company || "", "HR<br>SEAL")}`,
  });
}

async function main() {
  if (!storage.db) throw new Error("No DB");
  const db = storage.db;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let count = 0;
  const render = async (fileUrl: string, html: string) => {
    const out = diskPath(fileUrl);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: out, format: "A4", printBackground: true });
    count++;
  };

  // Candidate docs
  const candRows = await db.select().from(candidates);
  const userRows = await db.select().from(users);
  const unById: Record<string, string> = {};
  for (const u of userRows) unById[u.id] = u.username;
  const docRows = await db.select().from(documents);
  for (const c of candRows) {
    (c as any).username = unById[c.userId!];
    (c as any).photoB64 = photoB64(c.photoUrl);
  }
  const candById: Record<string, any> = {}; for (const c of candRows) candById[c.id] = c;
  const eduAll = await db.select().from(candidateEducation);
  const expAll = await db.select().from(candidateExperience);
  for (const d of docRows) {
    const c = candById[d.candidateId!]; if (!c) continue;
    const edu = eduAll.filter((e) => e.candidateId === c.id);
    const exp = expAll.filter((e) => e.candidateId === c.id);
    let html = "";
    if (d.type === "cv") html = cvDoc(c, edu, exp);
    else if (d.type === "passport") html = passportDoc(c);
    else if (d.type === "identity_proof") html = aadhaarDoc(c);
    else html = certificateDoc(c, edu[0]);
    await render(d.fileUrl, html);
  }
  console.log(`Candidate docs: rendered`);

  // Agency docs
  const agRows = await db.select().from(recruitmentAgents);
  const agById: Record<string, any> = {}; for (const a of agRows) agById[a.id] = a;
  const agDocs = await db.select().from(agencyDocuments);
  for (const d of agDocs) { const a = agById[d.agencyId]; if (a) await render(d.fileUrl, agencyDoc(d.type, a)); }
  console.log(`Agency docs: rendered`);

  // Employer docs
  const empRows = await db.select().from(employers);
  const empById: Record<string, any> = {}; for (const e of empRows) empById[e.id] = e;
  const empDocs = await db.select().from(employerDocuments);
  for (const d of empDocs) { const e = empById[d.employerId]; if (e) await render(d.fileUrl, employerDoc(d.type, e)); }
  console.log(`Employer docs: rendered`);

  // Appointment letters
  const plRows = await db.select().from(placements);
  const appRows = await db.select().from(applications);
  const jobRows = await db.select().from(jobs);
  const appById: Record<string, any> = {}; for (const a of appRows) appById[a.id] = a;
  const jobById: Record<string, any> = {}; for (const j of jobRows) jobById[j.id] = j;
  for (const p of plRows) {
    if (!p.appointmentLetterUrl) continue;
    const app = appById[p.applicationId]; const cand = app ? candById[app.candidateId] : null; const job = app ? jobById[app.jobId] : null;
    if (cand) await render(p.appointmentLetterUrl, appointmentDoc(cand, job, p));
  }
  console.log(`Appointment letters: rendered`);

  await browser.close();
  console.log(`\n✅ Generated ${count} sample documents.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
