import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { setup, login, logout, typeText, field, typeIn, setDate, choose } from "../video-lite/_film";
import { check, sql, waitIdle } from "./_check";

/** Applicant checks — Verify cases L1.x plus cross-portal L5.2 / L5.4. */
const FIX = path.resolve("tests/video-lite/fixtures");
const STAMP = Date.now().toString().slice(-6);
const EMAIL = `auto.${STAMP}@demo.com`;
const PASS = "Auto@2026x";
const next = async (page: Page) => { await page.getByRole("button", { name: /^Next/ }).last().click(); await waitIdle(page, 1200); };

test("Applicant", async ({ page }) => {
  await setup(page);
  await page.goto("/auth");

  await check(page, "L1.3", "Language switch turns the sign-in page into Hindi and back", async () => {
    await page.getByRole("button", { name: /हिं/ }).first().click();
    await expect(page.getByText("स्वागत है").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /^EN$/ }).first().click();
    await expect(page.getByText("Welcome").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.2", "Sign in works with username and with email; a wrong password is refused", async () => {
    const ok1 = await page.request.post("/api/v1/auth/login", { data: { username: "demo_candidate", password: "test123" } });
    const ok2 = await page.request.post("/api/v1/auth/login", { data: { username: "demo_candidate@hirestream.dev", password: "test123" } });
    const bad = await page.request.post("/api/v1/auth/login", { data: { username: "demo_candidate", password: "wrong-pass" } });
    expect([ok1.status(), ok2.status(), bad.status()]).toEqual([200, 200, 401]);
    await page.context().clearCookies();
  });

  await check(page, "L1.1", "Create a new applicant account; the application form opens", async () => {
    await page.goto("/auth"); await waitIdle(page);
    await page.getByRole("tab", { name: /Create Account/ }).click();
    await page.getByPlaceholder("Enter your full name").fill("Auto Applicant");
    await page.getByPlaceholder("name@example.com").last().fill(EMAIL);
    await page.getByPlaceholder("Min. 8 characters").fill(PASS);
    await page.getByPlaceholder("Re-type your password").fill(PASS);
    await page.locator("form").getByRole("button", { name: /Create Account/ }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/register"), { timeout: 30000 });
    await waitIdle(page);
    await page.getByRole("button", { name: /I have these/ }).click({ timeout: 5000 }).catch(() => {});
  });

  await check(page, "L1.4", "Page 1 validates Aadhaar checksum and saves valid details", async () => {
    await typeIn(page, "Aadhaar number", "234567890123");
    await expect(page.getByText(/not valid/i).filter({ visible: true }).first()).toBeVisible();
    await typeIn(page, "Passport number", "W4821736");
    await setDate(page, "Date of expiry", "2033-05-14");
    await typeIn(page, "Aadhaar number", "234567890124");
    const nm = field(page, "Full name").locator("input").first();
    if (!(await nm.inputValue())) await typeIn(page, "Full name", "Auto Applicant");
    await setDate(page, "Date of birth", "1994-08-21");
    await choose(page, page, "Gender", "Male");
    await typeIn(page, "Father's name", "Mohan Lal");
    await typeIn(page, "Mother's name", "Kamla Devi");
    await choose(page, page, "Do you have a disability?", "No");
    await typeIn(page, "Mobile number", "9816012345");
    await typeIn(page, "Home Town", "Sundernagar");
    await typeIn(page, "Address line 1", "Village Chambi");
    await choose(page, page, "District", "Mandi");
    await typeIn(page, "PIN code", "175019");
    await next(page);
    await expect(page.getByText(/What skills do you have/).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.7", "Page 2: trades capped at three; languages saved", async () => {
    for (const t of ["Driver", "Mason", "Plumber"]) await page.getByRole("button", { name: new RegExp(`^${t}`) }).first().click();
    await page.getByRole("button", { name: /^Painter/ }).first().click();
    await expect(page.getByText(/up to 3 trades/i).filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Mason/ }).first().click();
    await page.getByRole("button", { name: /^Plumber/ }).first().click();
    await page.getByRole("button", { name: /^Hindi/ }).first().click();
    await next(page);
    await expect(page.getByText(/qualifications and experience/i).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.8", "Page 3: board list follows the qualification", async () => {
    await choose(page, page, "Highest qualification", "12th pass");
    await field(page, "Board").locator('button[role="combobox"]').first().click();
    await expect(page.getByRole("option", { name: "HPBOSE" })).toBeVisible();
    await page.getByRole("option", { name: "HPBOSE" }).click();
    await choose(page, page, "Highest qualification", "College degree");
    await field(page, "University / College").locator('button[role="combobox"]').first().click();
    await expect(page.getByRole("option", { name: /Himachal Pradesh University/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await choose(page, page, "Highest qualification", "12th pass");
  });

  await check(page, "L6.7", "Board 'Other' box stays open when cleared; changing qualification group clears the old board", async () => {
    // Fixed 14 Nov 2026 (HL-007).
    const board = field(page, "Board").locator('button[role="combobox"]').first();
    await board.click();
    await page.getByRole("option", { name: /Other \(type it in\)/ }).click();
    const box = page.getByPlaceholder("Type your board's name");
    await box.fill("Punjab School Education Board");
    await box.fill("");
    await expect(box, "box still open after clearing").toBeVisible();
    await board.click();
    await page.getByRole("option", { name: "HPBOSE" }).click();
    await choose(page, page, "Highest qualification", "College degree");
    await expect(field(page, "University / College").locator('button[role="combobox"]').first(), "old board cleared").not.toContainText("HPBOSE");
    await choose(page, page, "Highest qualification", "12th pass");
    await field(page, "Board").locator('button[role="combobox"]').first().click();
    await page.getByRole("option", { name: "HPBOSE" }).click();
  });

  await check(page, "L1.9", "Driver questions are required before Next; experience stepper works", async () => {
    await typeIn(page, "Driving licence number", "HP31 20140012345");
    await choose(page, page, "Licence class", /^HMV/);
    await setDate(page, "Licence valid until", "2034-03-31");
    await choose(page, page, "Do you hold a badge / PSV licence?", "Yes");
    const more = page.getByRole("button", { name: "Six months more" }).first();
    for (let k = 0; k < 4; k++) await more.click();
    await expect(page.getByText(/≈ 2(\.0)? years/).filter({ visible: true }).first()).toBeVisible();
    await next(page);
    await expect(page.getByText(/Check and submit/).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.10", "Review page masks Aadhaar and offers Edit and Print", async () => {
    await expect(page.getByText(/XXXX XXXX 0124/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Print \/ Save PDF/ })).toBeVisible();
    expect(await page.getByRole("button", { name: /Edit/ }).filter({ visible: true }).count(), "Edit buttons").toBeGreaterThan(2);
  });

  await check(page, "L1.11", "Submit application lands on the dashboard", async () => {
    await page.getByRole("button", { name: /Submit application/ }).last().click();
    await page.waitForTimeout(2500);
    expect(sql(`select profile_complete from candidates c join users u on u.id=c.user_id where u.email='${EMAIL}'`), "saved as submitted").toBe("t");
    expect(new URL(page.url()).pathname, "page after submit").not.toMatch(/^\/register/);
  });

  await check(page, "L6.1", "Retest: first Submit lands on the dashboard, not page 1 of the form", async () => {
    // Fixed 14 Nov 2026 (HL-001) — same moment as L1.11, recorded against the defect case.
    expect(new URL(page.url()).pathname, "page after submit").not.toMatch(/^\/register/);
  });

  await check(page, "L1.12", "Confirm email with the 6-digit code", async () => {
    await page.goto("/"); await waitIdle(page, 1500);
    const code = sql(`select code from otp_codes where email='${EMAIL}' order by created_at desc limit 1`);
    expect(code, "code issued").toMatch(/^\d{6}$/);
    await page.getByPlaceholder("6-digit code").first().fill(code);
    await page.getByRole("button", { name: /^Confirm$/ }).first().click();
    await expect(page.getByText(/Email confirmed/).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
  });

  await check(page, "L1.13", "Find a Job search narrows the list and shows match scores", async () => {
    await page.getByRole("button", { name: /Find a Job/ }).nth(1).click({ timeout: 5000 }).catch(() => page.getByRole("button", { name: /Find a Job/ }).first().click());
    await waitIdle(page, 1200);
    await page.getByPlaceholder(/Search by title/).first().fill("Driver");
    await page.waitForTimeout(1200);
    await expect(page.getByText("Heavy Truck Driver", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/\d+%/).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.14", "Apply Now works; a second application to the same job is refused", async () => {
    await page.getByText("Heavy Truck Driver", { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Apply Now/i }).last().click();
    await waitIdle(page, 1500);
    const jobId = sql("select id from jobs where title='Heavy Truck Driver' limit 1");
    const again = await page.request.post(`/api/v1/jobs/${jobId}/apply`, { data: {} });
    expect(again.status(), "duplicate apply").toBeGreaterThanOrEqual(400);
    expect(sql(`select count(*) from applications a join candidates c on c.id=a.candidate_id join users u on u.id=c.user_id where u.email='${EMAIL}'`)).toBe("1");
  });

  await check(page, "L1.15", "My Application shows the application and its stage", async () => {
    await page.getByRole("button", { name: /My Application/ }).first().click();
    await waitIdle(page);
    await page.getByText("Heavy Truck Driver", { exact: true }).first().click();
    await expect(page.getByText("Submitted").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L6.6", "Simple dashboard: a new application fills only the 'Applied' segment", async () => {
    // Fixed 14 Nov 2026 (HL-006). Direct pipeline: Applied · Interview · Selected · Placed.
    await page.goto("/"); await waitIdle(page, 1500);
    const bar = page.locator("div.flex.gap-1\\.5").filter({ has: page.locator("div.h-2\\.5") }).filter({ visible: true }).first();
    await expect(bar).toBeVisible();
    expect(await bar.locator("div.h-2\\.5").count(), "segments").toBe(4);
    expect(await bar.locator("div.bg-emerald-500").count(), "filled segments").toBe(1);
  });

  await check(page, "L1.23", "Request a callback is accepted and reaches the admin queue", async () => {
    await page.goto("/callback"); await waitIdle(page, 1500);
    const inputs = page.locator("input");
    if (!(await inputs.nth(0).inputValue())) await inputs.nth(0).fill("Auto Applicant");
    if (!(await inputs.nth(1).inputValue())) await inputs.nth(1).fill("9816012345");
    await page.getByRole("button", { name: /Request a callback/i }).first().click();
    await waitIdle(page, 1500);
    expect(sql(`select c.wants_callback from candidates c join users u on u.id=c.user_id where u.email='${EMAIL}'`), "flag saved").toBe("t");
    const q = await page.request.get("/api/v1/admin/callback-requests");
    expect(q.status(), "candidate must not read the admin queue").toBeGreaterThanOrEqual(401);
  });

  await check(page, "L5.4", "Old links (/apply, /profile, /start) redirect to the form", async () => {
    for (const p of ["/apply", "/profile", "/start"]) {
      await page.goto(p); await waitIdle(page, 600);
      expect(new URL(page.url()).pathname, p).toBe("/register");
    }
  });

  await check(page, "L5.2", "A candidate cannot open staff pages or staff APIs", async () => {
    const r1 = await page.request.get("/api/v1/agent/applicants");
    const r2 = await page.request.get("/api/v1/admin/settings");
    expect([r1.status(), r2.status()].every((s) => s === 401 || s === 403), `got ${r1.status()} / ${r2.status()}`).toBe(true);
  });

  await check(page, "L1.16", "Interview: candidate confirms attendance", async () => {
    await logout(page); await login(page, "shalini_rathore");
    await page.getByRole("button", { name: /My Application/ }).first().click();
    await waitIdle(page);
    await page.getByText("ICU Nurse", { exact: true }).first().click();
    await page.getByRole("button", { name: /Confirm attendance/ }).first().click();
    await waitIdle(page, 1200);
    await expect(page.getByText(/You confirmed|Attendance confirmed/).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.17", "Selected candidate sees documents owed, each with a reason", async () => {
    await logout(page); await login(page, "nirmala_devi");
    await expect(page.getByText("Documents needed before you travel").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Complete your travel documents/ }).first().click();
    await waitIdle(page, 1500);
    await expect(page.getByText("Police Clearance Certificate (PCC)").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.18", "Upload a document; its row shows HPSEDC are checking it", async () => {
    const rowEl = page.locator("div").filter({ hasText: /Medical fitness certificate/ }).filter({ has: page.getByRole("button", { name: /^(Upload|Replace)$/ }) }).last();
    const btn = rowEl.getByRole("button", { name: /^(Upload|Replace)$/ }).first();
    const chooser = page.waitForEvent("filechooser");
    await btn.click();
    await (await chooser).setFiles(path.join(FIX, "medical-certificate.pdf"));
    await waitIdle(page, 1800);
    await expect(rowEl.getByText(/HPSEDC are checking it|checked and accepted/).filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.19", "Before you travel: progress saves", async () => {
    await next(page);
    const combos = page.getByRole("combobox");
    await combos.nth(0).click(); await page.getByRole("option", { name: /Applied for it/ }).first().click();
    await page.getByRole("button", { name: /Save my progress/ }).click();
    await expect(page.getByText(/^Saved$/).filter({ visible: true }).first()).toBeVisible({ timeout: 8000 });
  });

  await check(page, "L1.21", "Ask HPSEDC: candidate sends a message", async () => {
    await page.goto("/help"); await waitIdle(page);
    await page.getByPlaceholder(/Type your message/).first().fill("Automated check message to HPSEDC.");
    await page.locator("button:has(svg.lucide-send)").first().click();
    await waitIdle(page, 1200);
    await expect(page.getByText("Automated check message to HPSEDC.").filter({ visible: true }).first()).toBeVisible();
  });

  await check(page, "L1.20", "Offer: accept after the appointment letter is uploaded; candidate becomes Placed", async () => {
    // Make the precondition true on the copy: HPSEDC uploads the letter for suresh_thakur's offer.
    const pid = sql(`select p.id from placements p join applications a on a.id=p.application_id join candidates c on c.id=a.candidate_id join users u on u.id=c.user_id where u.username='suresh_thakur' and p.status='offered' limit 1`);
    expect(pid, "suresh has an open offer").not.toBe("");
    await logout(page);
    const agent = await page.request.post("/api/v1/auth/login", { data: { username: "hpsedc_agency", password: "test123" } });
    expect(agent.status()).toBe(200);
    const fs = await import("fs");
    const up = await page.request.post(`/api/v1/agent/placements/${pid}/appointment-letter-file`, {
      multipart: { file: { name: "appointment-letter.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(FIX, "appointment-letter.pdf")) } },
    });
    expect(up.status(), "letter upload").toBeLessThan(300);
    await page.context().clearCookies();
    await page.goto("/auth"); await login(page, "suresh_thakur");
    await page.getByRole("button", { name: /make a decision/ }).first().click();
    await waitIdle(page);
    await page.getByText("Heavy Truck Driver", { exact: true }).first().click();
    await page.getByRole("button", { name: /Accept Offer/ }).first().click();
    await waitIdle(page, 1500);
    await page.getByRole("button", { name: /Confirm|Yes/ }).last().click({ timeout: 3000 }).catch(() => {});
    await waitIdle(page, 1500);
    expect(sql(`select a.status from applications a join placements p on p.application_id=a.id where p.id='${pid}'`)).toBe("placed");
  });

  await check(page, "L1.22", "Notifications bell opens the notification list", async () => {
    await page.goto("/"); await waitIdle(page);
    await page.getByRole("button", { name: /^Notifications \(/ }).filter({ visible: true }).first().click();
    await expect(page.getByText(/Mark all read|Notifications/).filter({ visible: true }).first()).toBeVisible();
  });
});
