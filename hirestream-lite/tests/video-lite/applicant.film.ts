import { test, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { beat, showTitleCard } from "./_overlay";
import {
  film, setup, login, logout, settle, scrollTo, scrollBy, point, typeText,
  field, typeIn, setDate, choose, BEST,
} from "./_film";

/**
 * APPLICANT — the candidate journey on hirestream-lite.
 * Chapters 1–7 follow ONE new person (Rajesh Kumar) from sign-up to applying.
 * Chapters 8–11 use seeded candidates who are already further along, because
 * a real candidate waits days between those steps:
 *   shalini_rathore (interview scheduled) · nirmala_devi (selected, documents
 *   owed, and has a reply from HPSEDC) · suresh_thakur (offer open; the agency
 *   film uploads his appointment letter, so record agency FIRST).
 * The email code is read from the recording database (VIDEO_DB) — this is a
 * disposable copy; never point this at a real portal.
 */
const FIX = path.resolve("tests/video-lite/fixtures");
const STAMP = Date.now().toString().slice(-4);
const EMAIL = `rajesh.kumar.${STAMP}@example.com`;
const PASS = "Rajesh@2026";
const DB = process.env.VIDEO_DB || "hirestream_lite_video";

function latestOtp(email: string): string {
  const out = execFileSync("psql", ["-h", "localhost", "-U", "hirestream", "-d", DB, "-At", "-c",
    `select code from otp_codes where email='${email}' order by created_at desc limit 1`],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "hirestream" } }).toString().trim();
  return out;
}

async function next(page: Page) {
  await page.getByRole("button", { name: /^Next/ }).last().click();
  await settle(page, 1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await beat(page, 600);
}

test("Applicant", async ({ page }) => {
  await setup(page);
  const f = film(page, "applicant");

  await page.goto("/auth");
  await settle(page);
  f.start();
  await showTitleCard(page, "Applicant User Guide", "How to register, apply and get ready to travel with HPSEDC",
    "Walkthrough · Candidates", 4200);

  // 1 ── Create an account
  await f.chapter("account");
  await f.snap("01-signin");
  const hi = page.getByRole("button", { name: /हिं|हिंदी/ }).first();
  await point(page, hi);
  await hi.click(BEST).catch(() => {});
  await beat(page, 1500);
  await f.snap("02-hindi");
  await page.getByRole("button", { name: /^EN$|English/ }).first().click(BEST).catch(() => {});
  await beat(page, 800);
  await page.getByRole("tab", { name: /Create Account/ }).click();
  await beat(page, 600);
  const role = page.getByRole("combobox").first();
  if (!(await role.innerText().catch(() => "")).match(/Job Seeker/)) {
    await role.click(BEST).catch(() => {});
    await page.getByRole("option", { name: /Job Seeker/ }).click(BEST).catch(() => {});
  }
  await typeText(page.getByPlaceholder("Enter your full name"), "Rajesh Kumar");
  await typeText(page.getByPlaceholder("name@example.com").last(), EMAIL);
  await typeText(page.getByPlaceholder("Min. 8 characters"), PASS);
  await typeText(page.getByPlaceholder("Re-type your password"), PASS);
  await beat(page, 400);
  await f.snap("03-create-account");
  await page.locator("form").getByRole("button", { name: /Create Account/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30000 }).catch(() => {});
  await settle(page, 2000);

  // 2 ── Page 1: About you
  await f.chapter("aboutyou");
  await f.snap("04-before-you-start");
  await page.getByRole("button", { name: /I have these/ }).click(BEST).catch(() => {});
  await beat(page, 800);
  await f.snap("05-page1-top");
  await typeIn(page, "Passport number", "W4821736");
  await setDate(page, "Date of expiry", "2033-05-14");
  await setDate(page, "Date of issue", "2023-05-15");
  await typeIn(page, "Place of issue", "Shimla");
  await choose(page, page, "ECR / ECNR status", /ECR \(emigration check required\)/);
  await typeIn(page, "Aadhaar number", "234567890124");
  await beat(page, 400);
  const nameInp = field(page, "Full name").locator("input").first();
  if (!(await nameInp.inputValue().catch(() => ""))) await typeIn(page, "Full name", "Rajesh Kumar");
  await setDate(page, "Date of birth", "1994-08-21");
  await choose(page, page, "Gender", "Male");
  await typeIn(page, "Father's name", "Mohan Lal");
  await typeIn(page, "Mother's name", "Kamla Devi");
  await choose(page, page, "Do you have a disability?", "No");
  await typeIn(page, "Mobile number", "9816012345");
  const em = field(page, "Email ID").locator("input").first();
  if (!(await em.inputValue().catch(() => ""))) await typeIn(page, "Email ID", EMAIL);
  await typeIn(page, "Home Town", "Sundernagar");
  await typeIn(page, "Address line 1", "Village Chambi, PO Bhojpur");
  await choose(page, page, "District", "Mandi");
  await typeIn(page, "PIN code", "175019");
  await beat(page, 600);
  await f.snap("06-page1-filled", { full: true });
  await next(page);

  // 3 ── Page 2: Skills and languages
  await f.chapter("skills");
  await f.snap("07-page2");
  await page.getByRole("button", { name: /^Driver/ }).first().click();
  await beat(page, 600);
  const langTile = (n: string) => page.getByRole("button", { name: new RegExp("^" + n) }).first();
  await scrollTo(page, page.getByText("Languages").first());
  await langTile("Hindi").click();
  await beat(page, 400);
  await langTile("English").click();
  await beat(page, 400);
  // Speak/Write levels for the selected languages: Hindi native, English good
  const levelRows = page.locator("div").filter({ hasText: /^Speak/ });
  await levelRows.first().getByRole("button", { name: "Native" }).first().click(BEST).catch(() => {});
  await levelRows.nth(1).getByRole("button", { name: "Good" }).first().click(BEST).catch(() => {});
  await beat(page, 600);
  await f.snap("08-page2-filled", { full: true });
  await next(page);

  // 4 ── Page 3: Qualifications and experience
  await f.chapter("qualifications");
  await choose(page, page, "Highest qualification", "12th pass");
  await choose(page, page, "Board", "HPBOSE");
  await typeIn(page, "School / institution", "GSSS Bhojpur");
  await typeIn(page, "Year of passing", "2012").catch(() => choose(page, page, "Year of passing", "2012"));
  await beat(page, 400);
  await scrollTo(page, page.getByText("Driving licence number").first());
  await typeIn(page, "Driving licence number", "HP31 20140012345");
  await choose(page, page, "Licence class", /^HMV/);
  await setDate(page, "Licence valid until", "2034-03-31");
  await choose(page, page, "Do you hold a badge / PSV licence?", "Yes");
  await beat(page, 400);
  const more = page.getByRole("button", { name: "Six months more" }).first();
  await scrollTo(page, more);
  for (let k = 0; k < 8; k++) { await more.click(); await beat(page, 120); }
  const chips = page.locator("div").filter({ hasText: /^What specifically can you do\?/ }).locator("xpath=..").getByRole("button");
  for (let k = 0; k < 3; k++) await chips.nth(k).click(BEST).catch(() => {});
  await typeIn(page, "Last employer (optional)", "Himachal Road Transport Corporation").catch(() => {});
  await beat(page, 600);
  await f.snap("09-page3-filled", { full: true });
  await next(page);

  // 5 ── Page 4: Review, print and submit
  await f.chapter("review");
  await f.snap("10-review", { full: true });
  await scrollBy(page, 500);
  await beat(page, 1000);
  await scrollBy(page, 500);
  await beat(page, 1000);
  await point(page, page.getByRole("button", { name: /Print \/ Save PDF/ }).first());
  await beat(page, 600);
  const submit = page.getByRole("button", { name: /Submit application/ }).last();
  await scrollTo(page, submit);
  await submit.click();
  await beat(page, 2200); // "Application submitted" confirmation toast
  // Known app issue: the first submit bounces back to page 1 of the form
  // (stale profile cache in CandidateEntry). Open the dashboard explicitly.
  await page.getByRole("button", { name: /^Dashboard$/ }).first().click(BEST).catch(() => page.goto("/"));
  await settle(page, 2000);
  if (page.url().includes("/register")) { await page.goto("/"); await settle(page, 2000); }

  // 6 ── Dashboard + confirm email
  await f.chapter("verify");
  await f.snap("11-dashboard-verify");
  const code = latestOtp(EMAIL);
  const codeBox = page.getByPlaceholder("6-digit code").first();
  await point(page, codeBox);
  await typeText(codeBox, code || "000000", 120);
  await page.getByRole("button", { name: /^Confirm$/ }).first().click();
  await settle(page, 1800);
  await f.snap("12-dashboard", { full: true });

  // 7 ── Find a job and apply
  await f.chapter("apply");
  await page.getByRole("button", { name: /Find a Job/ }).nth(1).click(BEST).catch(() =>
    page.getByRole("button", { name: /Find a Job/ }).first().click());
  await settle(page, 1500);
  await typeText(page.getByPlaceholder(/Search by title/).first(), "Driver");
  await beat(page, 1200);
  await f.snap("13-find-job");
  await page.getByText("Heavy Truck Driver", { exact: true }).first().click();
  await beat(page, 1500);
  await f.snap("14-job-detail");
  const applyBtn = page.getByRole("button", { name: /Apply Now/i }).last();
  await scrollTo(page, applyBtn);
  await applyBtn.click();
  await settle(page, 2000);
  await page.getByRole("button", { name: /My Application/ }).first().click(BEST).catch(() => {});
  await settle(page, 1500);
  await page.getByText("Heavy Truck Driver", { exact: true }).first().click(BEST).catch(() => {});
  await beat(page, 1200);
  await f.snap("15-my-application");

  // 8 ── Interview: confirm attendance (Shalini)
  await f.chapter("interview");
  await logout(page);
  await login(page, "shalini_rathore");
  await f.snap("16-interview-home");
  await page.getByRole("button", { name: /My Application/ }).first().click();
  await settle(page, 1200);
  await page.getByText("ICU Nurse", { exact: true }).first().click();
  await beat(page, 1500);
  await f.snap("17-interview-panel");
  const confirm = page.getByRole("button", { name: /Confirm attendance/ }).first();
  await scrollTo(page, confirm);
  await point(page, page.getByRole("button", { name: /Reschedule/ }).first());
  await point(page, page.getByRole("button", { name: /Decline/ }).first());
  await confirm.click();
  await settle(page, 1500);

  // 9 ── Selected: documents + before you travel (Nirmala)
  await f.chapter("documents");
  await logout(page);
  await login(page, "nirmala_devi");
  await f.snap("18-selected-home", { full: true });
  await scrollTo(page, page.getByText("Documents needed before you travel").first());
  await beat(page, 1200);
  await page.getByRole("button", { name: /Complete your travel documents/ }).first().click();
  await settle(page, 2000);
  await f.snap("19-page5-documents", { full: true });
  const docs: [RegExp, string][] = [
    [/Police Clearance/i, "police-clearance.pdf"],
    [/Medical/i, "medical-certificate.pdf"],
    [/Work experience|Experience/i, "experience-certificate.pdf"],
  ];
  for (const [label, file] of docs) {
    // One shared hidden <input type=file>; each row's Upload button arms it.
    const rowEl = page.locator("div").filter({ hasText: label }).filter({ has: page.getByRole("button", { name: /^Upload$/ }) }).last();
    const btn = rowEl.getByRole("button", { name: /^Upload$/ }).first();
    await scrollTo(page, btn);
    const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
    await btn.click();
    await (await chooser).setFiles(path.join(FIX, file));
    await settle(page, 1800);
  }
  await f.snap("20-page5-uploaded", { full: true });
  await next(page);
  await f.snap("21-page6-before-travel", { full: true });
  await page.getByRole("button", { name: /Applied for it/ }).first().click(BEST).catch(() => {});
  await page.getByRole("button", { name: /Booked \/ done/ }).first().click(BEST).catch(() => {});
  await beat(page, 500);
  await page.getByRole("button", { name: /Save my progress/ }).click(BEST).catch(() => {});
  await settle(page, 1200);
  await page.goto("/help");
  await settle(page, 1500);
  await f.snap("22-help-reply");

  // 10 ── Offer: accept (Suresh — letter uploaded by HPSEDC in the agency film)
  await f.chapter("offer");
  await logout(page);
  await login(page, "suresh_thakur");
  await page.getByRole("button", { name: /make a decision/ }).first().click();
  await settle(page, 1200);
  await page.getByText("Heavy Truck Driver", { exact: true }).first().click();
  await beat(page, 1500);
  await f.snap("23-offer");
  const accept = page.getByRole("button", { name: /Accept Offer/ }).first();
  await scrollTo(page, accept);
  await point(page, page.getByText(/offer letter/i).first());
  await accept.click();
  await settle(page, 1500);
  await page.getByRole("button", { name: /Confirm|Yes/ }).last().click(BEST).catch(() => {});
  await settle(page, 1500);
  await f.snap("24-offer-accepted", { full: true });

  // 11 ── Help, grievances and safety
  await f.chapter("help");
  await page.goto("/help");
  await settle(page, 1500);
  await f.snap("25-help");
  const msg = page.getByPlaceholder(/Type your message/).first();
  await typeText(msg, "Namaste. I have accepted the offer. When is the pre-departure orientation?");
  await page.locator("button:has(svg.lucide-send)").first().click(BEST).catch(() =>
    page.getByRole("button", { name: /Send/ }).first().click());
  await beat(page, 1500);
  await page.goto("/grievances");
  await settle(page, 1200);
  await page.getByRole("button", { name: /New Grievance/ }).first().click(BEST).catch(() => {});
  await beat(page, 1200);
  await f.snap("26-grievance");
  await beat(page, 1500);
  await page.keyboard.press("Escape");
  await page.goto("/");
  await settle(page, 1200);
  await page.locator("header button").filter({ has: page.locator("svg.lucide-bell") }).first().click(BEST).catch(() => {});
  await beat(page, 1800);
  await f.snap("27-notifications");
  await page.keyboard.press("Escape");

  await f.finish();
  await showTitleCard(page, "HireStream — HPSEDC", "Safe, regulated overseas jobs. HPSEDC never asks for money.", "Applicant walkthrough", 4000, false);
});
