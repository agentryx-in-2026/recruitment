import { test, type Page } from "@playwright/test";
import path from "path";
import { beat } from "./_overlay";
import { film, setup, login, settle, scrollTo, scrollBy, point, typeText, BEST } from "./_film";
import { showTitleCard } from "./_overlay";

/**
 * HPSEDC AS SUPER AGENCY — the day-to-day work of the HPSEDC Overseas
 * Placement Cell, signed in as hpsedc_agency (the account every job belongs to
 * in single-agency mode). Compact pipeline: Applied → Interview → Selected → Placed.
 *
 * Data it relies on (see README): champa_devi has a pending reschedule request,
 * sanjay_chauhan an interview awaiting outcome, suresh_thakur an open offer
 * with no appointment letter yet, rakesh_verma a placed candidate.
 */
const FIX = path.resolve("tests/video-lite/fixtures");

async function openPipeline(page: Page, status: string) {
  await page.goto(`/agent/applicants?status=${status}`);
  await settle(page);
}

/** Row on the Applications Pipeline page for a candidate name. */
function row(page: Page, name: string) {
  return page.locator("div").filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /View/ }) }).last();
}

test("Agency", async ({ page }) => {
  await setup(page);
  const f = film(page, "agency");

  await page.goto("/auth");
  await settle(page);
  f.start();
  await showTitleCard(page, "HPSEDC as Super Agency", "Running overseas recruitment day to day — jobs, interviews, selection and pre-departure",
    "Walkthrough · HPSEDC Overseas Placement Cell", 4200);

  // 1 ── Sign in & dashboard
  await f.chapter("login");
  await f.snap("01-signin");
  await login(page, "hpsedc_agency");
  await f.snap("02-dashboard", { full: true });
  await point(page, page.getByText("Verified Agency").first());
  await point(page, page.getByText("Applicant Pipeline").first());
  await scrollBy(page, 380);
  await beat(page, 1500);
  await scrollBy(page, -380);
  await point(page, page.getByRole("button", { name: /Post Job/ }).first());

  // 2 ── Post a job
  await f.chapter("post");
  await page.getByRole("button", { name: /Post Job/ }).first().click();
  await beat(page, 900);
  const dlg = page.getByRole("dialog");
  await typeText(dlg.getByPlaceholder(/Registered Nurse/), "Staff Nurse — General Ward");
  await typeText(dlg.getByPlaceholder(/Name of the hiring company/), "NMC Healthcare");
  const cb = dlg.getByRole("combobox");
  const pick = async (i: number, opt: RegExp, fallbackNth = 0) => {
    await cb.nth(i).click();
    await beat(page, 350);
    const o = page.getByRole("option").filter({ hasText: opt });
    if (await o.count()) await o.first().click(); else await page.getByRole("option").nth(fallbackNth).click();
    await beat(page, 300);
  };
  await pick(0, /United Arab Emirates/);
  await pick(1, /^Dubai$/);
  await pick(2, /^Healthcare$/);
  await f.snap("03-post-job-basics");
  await pick(3, /AED/);
  await pick(4, /Per month/);
  await pick(5, /^4k$|^4,?500|^5k$/, 3);
  await pick(6, /^2 years$/);
  await scrollTo(page, dlg.getByText("Hiring criteria").first());
  await beat(page, 600);
  await scrollTo(page, dlg.getByText("Description & skills").first());
  const desc = dlg.locator("textarea").first();
  await typeText(desc, "General ward nursing for a 300-bed hospital in Dubai. Free accommodation, transport and medical insurance.");
  const skill = dlg.getByPlaceholder(/Type a skill/i).first();
  await scrollTo(page, skill);
  for (const s of ["Patient care", "IV therapy"]) {
    await skill.click();
    await skill.pressSequentially(s, { delay: 25 });
    await skill.press("Enter");
    await beat(page, 300);
  }
  await beat(page, 600);
  await f.snap("04-post-job-details");
  await dlg.getByRole("button", { name: /Publish Job/ }).click();
  await settle(page, 1800);

  // 3 ── My Jobs + job page
  await f.chapter("jobs");
  await page.getByRole("button", { name: /^My Jobs/ }).first().click(BEST).catch(() => page.goto("/?view=jobs"));
  await settle(page);
  await f.snap("05-my-jobs");
  await point(page, page.getByPlaceholder(/Search title/).first());
  await page.getByText("Staff Nurse — General Ward").first().click({ noWaitAfter: true });
  await settle(page, 1500);
  if (!page.url().includes("/agent/jobs/")) {
    await page.getByRole("link", { name: /Manage/ }).first().click(BEST).catch(() => {});
    await settle(page);
  }
  await f.snap("06-job-page");
  for (const b of [/^Edit$/, /Preview/, /Share/, /Close/, /Export CSV/]) {
    await point(page, page.getByRole("button", { name: b }).first());
  }
  await scrollBy(page, 420);
  await beat(page, 1200);

  // 4 ── Applications pipeline + candidate profile
  await f.chapter("pipeline");
  await openPipeline(page, "submitted");
  await f.snap("07-pipeline");
  await point(page, page.getByText(/^Submitted$/).first());
  await point(page, page.getByText(/Stale/).first());
  await point(page, page.getByPlaceholder(/Search candidate/).first());
  await page.getByRole("button", { name: /View/ }).first().click({ noWaitAfter: true });
  await settle(page, 1500);
  await f.snap("08-candidate-profile", { full: true });
  await scrollBy(page, 500);
  await beat(page, 1200);
  await scrollBy(page, 500);
  await beat(page, 1000);

  // 5 ── Schedule an interview
  await f.chapter("schedule");
  await openPipeline(page, "submitted");
  await page.getByRole("button", { name: /Schedule interview/ }).first().click({ noWaitAfter: true });
  await beat(page, 900);
  const sd = page.getByRole("dialog");
  const when = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  await sd.locator('input[type="date"]').fill(when);
  await sd.locator('input[type="time"]').fill("10:30");
  await typeText(sd.getByPlaceholder(/Hotel Clarkes/), "HPSEDC Office, Nigam Vihar, Shimla");
  await typeText(sd.getByPlaceholder(/Sarah Mitchell/), "Interview Board — HPSEDC");
  await beat(page, 500);
  await f.snap("09-schedule-interview");
  await sd.getByRole("button", { name: /Schedule & Notify/ }).click();
  await settle(page, 1800);
  await openPipeline(page, "interview_scheduled");
  await f.snap("10-interview-list");

  // 6 ── Reschedule request
  await f.chapter("reschedule");
  const rr = page.getByRole("button", { name: /Respond to reschedule/ }).first();
  await point(page, rr);
  await rr.click({ noWaitAfter: true });
  await beat(page, 1200);
  await f.snap("11-reschedule");
  await beat(page, 1500);
  await page.getByRole("button", { name: /Accept proposed time/ }).click();
  await settle(page, 1500);

  // 7 ── Record outcome → Selected
  await f.chapter("outcome");
  await openPipeline(page, "interview_scheduled");
  await page.getByRole("button", { name: /Outcome/ }).last().click({ noWaitAfter: true });
  await beat(page, 900);
  const od = page.getByRole("dialog");
  await od.getByRole("button", { name: /Pass \/ Select/ }).click();
  await od.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /4 — Good/ }).click();
  await typeText(od.locator("textarea").first(), "Strong practical test. 6G-certified, good safety awareness.");
  await beat(page, 500);
  await f.snap("12-record-outcome");
  await od.getByRole("button", { name: /Select Candidate/ }).click();
  await settle(page, 1800);
  await openPipeline(page, "selected");
  await f.snap("13-selected-list");

  // 8 ── Selected candidate: pre-departure (appointment letter, travel date, visa)
  await f.chapter("predeparture");
  await row(page, "Suresh Thakur").getByRole("button", { name: /View/ }).first().click();
  await settle(page, 1500);
  const app = page.getByText("Appointment & travel").first();
  await scrollTo(page, page.getByText(/Deployment Readiness|Pre-Departure Compliance/).first());
  await f.snap("14-readiness");
  await beat(page, 1200);
  await scrollTo(page, page.getByText("Pre-Departure Compliance").first());
  await f.snap("15-compliance");
  await beat(page, 1200);
  await scrollTo(page, page.getByText("Visa / passport assistance").first());
  const visa = page.locator("div.border-t").filter({ hasText: "Visa / passport assistance" }).first();
  await visa.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Application submitted" }).click();
  await typeText(visa.getByPlaceholder(/Embassy appointment/), "Visa application filed with the UAE embassy");
  await visa.getByRole("button", { name: /Update & notify/ }).click();
  await settle(page, 1200);
  await scrollTo(page, app);
  const at = page.locator("div.border-t").filter({ hasText: "Appointment & travel" }).first();
  const travel = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  await at.locator('input[type="date"]').fill(travel);
  await at.locator("button").first().click();
  await beat(page, 800);
  await at.locator('input[type="file"]').setInputFiles(path.join(FIX, "appointment-letter.pdf"));
  await settle(page, 1500);
  await f.snap("16-appointment-travel");

  // 9 ── Placed: welfare check-ins
  await f.chapter("welfare");
  await openPipeline(page, "placed");
  await f.snap("17-placed-list");
  await row(page, "Rakesh Verma").getByRole("button", { name: /View/ }).first().click();
  await settle(page, 1500);
  const wf = page.locator("div.border-t").filter({ hasText: "Post-placement welfare check-ins" }).first();
  await scrollTo(page, wf);
  await wf.getByRole("button", { name: /^(Record|Edit)$/ }).first().click();
  await beat(page, 500);
  await typeText(wf.getByPlaceholder(/Notes/), "Spoke on phone — settled in, salary received on time.");
  await wf.getByRole("button", { name: /^Save$/ }).click();
  await settle(page, 1200);
  await f.snap("18-welfare");

  // 10 ── Messages & grievances
  await f.chapter("messages");
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: /^Messages/ }).first().click();
  await settle(page, 1200);
  await page.locator("button").filter({ hasText: "Nirmala Devi" }).first().click();
  await beat(page, 1200);
  const reply = page.getByPlaceholder(/Type your reply/).first();
  await typeText(reply, "Namaste Nirmala ji. The medical is done at the GAMCA-approved centre in Chandigarh. HPSEDC will share the appointment slip. Please upload the report on your Documents page.");
  await page.locator("button:has(svg.lucide-send)").first().click();
  await beat(page, 1500);
  await f.snap("19-messages");
  await page.goto("/grievances");
  await settle(page, 1200);
  await f.snap("20-grievances");
  await beat(page, 1500);

  // 11 ── Reports
  await f.chapter("reports");
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: /^Reports/ }).first().click();
  await settle(page, 2000);
  await f.snap("21-reports", { full: true });
  for (let k = 0; k < 4; k++) { await scrollBy(page, 420); await beat(page, 900); }

  await f.finish();
  await showTitleCard(page, "HPSEDC Overseas Placement Cell", "Every job, interview and placement — tracked in one place", "HireStream · Super Agency walkthrough", 4000, false);
});
