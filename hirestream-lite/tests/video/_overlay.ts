import type { Page } from "@playwright/test";

/**
 * Inject a synthetic cursor (Playwright doesn't render the real pointer in
 * video) + a click ripple. Runs on every navigation via addInitScript.
 */
export async function installCursor(page: Page) {
  await page.addInitScript(() => {
    const ID = "pw-cursor";
    function mount() {
      if (document.getElementById(ID)) return;
      const c = document.createElement("div");
      c.id = ID;
      c.style.cssText =
        "position:fixed;z-index:2147483647;width:24px;height:24px;border-radius:50%;" +
        "border:2px solid #ef4444;background:rgba(239,68,68,0.30);pointer-events:none;" +
        "transform:translate(-50%,-50%);transition:left .07s linear,top .07s linear;left:-100px;top:-100px;";
      (document.body || document.documentElement).appendChild(c);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
    document.addEventListener("mousemove", (e) => {
      const c = document.getElementById(ID); if (!c) return;
      (c as HTMLElement).style.left = e.clientX + "px";
      (c as HTMLElement).style.top = e.clientY + "px";
    }, true);
    document.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText =
        "position:fixed;z-index:2147483646;left:" + e.clientX + "px;top:" + e.clientY + "px;" +
        "width:12px;height:12px;border-radius:50%;background:rgba(239,68,68,0.55);pointer-events:none;transform:translate(-50%,-50%);";
      (document.body || document.documentElement).appendChild(r);
      r.animate(
        [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(6)", opacity: 0 }],
        { duration: 480, easing: "ease-out" },
      );
      setTimeout(() => r.remove(), 500);
    }, true);
  });
}

/**
 * Lower-third caption: end-to-end with 10% side margins, slim band near the
 * bottom (well under 20% of screen height), centered text. Idempotent —
 * re-creates the bar after navigations.
 */
export async function caption(page: Page, text: string, holdMs = 1900) {
  await page.evaluate((t) => {
    let el = document.getElementById("pw-caption") as HTMLElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "pw-caption";
      el.style.cssText =
        "position:fixed;left:10%;right:10%;bottom:4%;z-index:2147483647;" +
        "background:rgba(15,23,42,0.86);color:#fff;text-align:center;" +
        "font:600 19px/1.4 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
        "padding:12px 22px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);" +
        "pointer-events:none;max-height:16vh;overflow:hidden;backdrop-filter:blur(2px);";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.waitForTimeout(holdMs);
}

/** Remove the caption (e.g. before a clean final frame). */
export async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById("pw-caption")?.remove());
}

/**
 * Top banner flagging that the on-screen feature resolves a specific item from
 * the HPSEDC test report (e.g. "Issue #3 · Agency MEA documents"). Stays until
 * clearIssue() is called. Sits at the top so it never clashes with the caption.
 */
export async function showIssue(page: Page, num: number, topic: string) {
  await page.evaluate(({ num, topic }) => {
    let el = document.getElementById("pw-issue") as HTMLElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "pw-issue";
      el.style.cssText =
        "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483646;" +
        "display:flex;align-items:center;gap:10px;max-width:80%;" +
        "background:linear-gradient(90deg,#047857,#10b981);color:#fff;" +
        "padding:9px 18px;border-radius:999px;box-shadow:0 6px 20px rgba(4,120,87,.45);" +
        "font:600 15px/1.2 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;pointer-events:none;";
      (document.body || document.documentElement).appendChild(el);
    }
    el.innerHTML =
      '<span style="font-size:16px">✓</span>' +
      '<span><b>Issue #' + num + ' resolved</b> &middot; ' + topic + '</span>' +
      '<span style="opacity:.8;font-weight:500;font-size:12px;border-left:1px solid rgba(255,255,255,.5);padding-left:10px">HPSEDC Test Report &mdash; 27 May 2026</span>';
  }, { num, topic });
}

export async function clearIssue(page: Page) {
  await page.evaluate(() => document.getElementById("pw-issue")?.remove());
}

/** Small settle pause for readability between actions. */
export async function beat(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

/**
 * Full-screen closing card summarising the HPSEDC test-report issues this
 * role's walkthrough resolved (e.g. Employer → #1, #2, #8). Fades in and holds
 * — it's the last thing on screen, so no fade-out. `issues` should be sorted
 * ascending by the caller.
 */
export async function showOutro(
  page: Page,
  roleTitle: string,
  issues: { num: number; label: string }[],
  holdMs = 7000,
) {
  await page.evaluate(({ roleTitle, issues }) => {
    document.getElementById("pw-issue")?.remove();
    document.getElementById("pw-caption")?.remove();
    document.getElementById("pw-outro")?.remove();
    const card = document.createElement("div");
    card.id = "pw-outro";
    card.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:14px;pointer-events:none;opacity:0;" +
      "background:linear-gradient(135deg,#0f172a 0%,#065f46 100%);" +
      "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;transition:opacity .35s ease;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:12px;font-size:30px;font-weight:800;letter-spacing:.3px;";
    head.innerHTML =
      '<span style="width:44px;height:44px;border-radius:50%;background:#10b981;display:inline-flex;' +
      'align-items:center;justify-content:center;font-size:26px">✓</span>' +
      'HPSEDC Test Report — Issues Resolved';
    const sub = document.createElement("div");
    sub.style.cssText = "font-size:17px;font-weight:600;opacity:.75;margin-bottom:8px;";
    sub.textContent = roleTitle;
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:12px;width:min(640px,80%);";
    issues.forEach((it) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:16px;background:rgba(255,255,255,0.08);" +
        "border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:14px 20px;";
      row.innerHTML =
        '<span style="flex:0 0 auto;min-width:62px;height:38px;padding:0 12px;border-radius:999px;' +
        'background:linear-gradient(90deg,#047857,#10b981);display:inline-flex;align-items:center;' +
        'justify-content:center;font-weight:800;font-size:17px">#' + it.num + '</span>' +
        '<span style="font-size:18px;font-weight:600;text-align:left">' + it.label + '</span>';
      list.appendChild(row);
    });
    const brand = document.createElement("div");
    brand.style.cssText = "position:fixed;bottom:5%;font-size:12px;letter-spacing:2px;opacity:.55;text-transform:uppercase;";
    brand.textContent = "HireStream — HPSEDC Test Report · 27 May 2026";
    card.appendChild(head); card.appendChild(sub); card.appendChild(list); card.appendChild(brand);
    (document.body || document.documentElement).appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; });
  }, { roleTitle, issues });
  await page.waitForTimeout(holdMs);
}

/**
 * Full-screen numbered chapter card ("1 · Login"). Fades in, holds, fades out
 * so the next action is visible. Narration for the section starts when this is
 * called (the caller records the timing offset for audio muxing).
 */
export async function showChapterCard(page: Page, num: number, title: string, holdMs = 2400) {
  await page.evaluate(({ num, title }) => {
    document.getElementById("pw-chapter")?.remove();
    const card = document.createElement("div");
    card.id = "pw-chapter";
    card.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:20px;pointer-events:none;opacity:0;" +
      "background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);" +
      "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;transition:opacity .3s ease;";
    const badge = document.createElement("div");
    badge.style.cssText =
      "width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,0.12);" +
      "border:2px solid rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;" +
      "font-size:46px;font-weight:800;";
    badge.textContent = String(num);
    const t = document.createElement("div");
    t.style.cssText = "font-size:38px;font-weight:700;letter-spacing:.3px;text-align:center;padding:0 8%;";
    t.textContent = title;
    const brand = document.createElement("div");
    brand.style.cssText = "position:fixed;bottom:6%;font-size:13px;letter-spacing:2px;opacity:.6;text-transform:uppercase;";
    brand.textContent = "HireStream — HPSEDC Overseas Placement";
    card.appendChild(badge); card.appendChild(t); card.appendChild(brand);
    (document.body || document.documentElement).appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; });
  }, { num, title });
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => {
    const c = document.getElementById("pw-chapter");
    if (c) { c.style.opacity = "0"; setTimeout(() => c.remove(), 350); }
  });
  await page.waitForTimeout(400);
}

