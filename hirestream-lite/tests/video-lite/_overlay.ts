import type { Page } from "@playwright/test";

/**
 * On-screen furniture for the hirestream-lite walkthrough films.
 * Forked from tests/video/_overlay.ts (the approved HireStream film style):
 * synthetic cursor + click ripple, numbered chapter cards, lower-third
 * captions — minus the May-2026 test-report badges, which do not apply here.
 * `snap()` additionally saves a clean screenshot (overlays hidden) for the
 * printed user guides, so guide and film always show the same build.
 */

/** Red synthetic cursor + click ripple (Playwright does not film the pointer). */
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

/** Lower-third caption, re-created after navigations. */
export async function caption(page: Page, text: string, holdMs = 1600) {
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
        "pointer-events:none;max-height:16vh;overflow:hidden;";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => {});
  await page.waitForTimeout(holdMs);
}

export async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById("pw-caption")?.remove()).catch(() => {});
}

export async function beat(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

/** Full-screen numbered chapter card. */
export async function showChapterCard(page: Page, num: number, title: string, brandLine: string, holdMs = 2400) {
  await page.evaluate(({ num, title, brandLine }) => {
    document.getElementById("pw-chapter")?.remove();
    document.getElementById("pw-caption")?.remove();
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
    brand.textContent = brandLine;
    card.appendChild(badge); card.appendChild(t); card.appendChild(brand);
    (document.body || document.documentElement).appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; });
  }, { num, title, brandLine });
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => {
    const c = document.getElementById("pw-chapter");
    if (c) { c.style.opacity = "0"; setTimeout(() => c.remove(), 350); }
  });
  await page.waitForTimeout(400);
}

/** Title / closing card (no number). */
export async function showTitleCard(page: Page, title: string, sub: string, foot: string, holdMs = 4000, fadeOut = true) {
  await page.evaluate(({ title, sub, foot }) => {
    document.getElementById("pw-title")?.remove();
    const card = document.createElement("div");
    card.id = "pw-title";
    card.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:16px;pointer-events:none;opacity:0;" +
      "background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#065f46 100%);" +
      "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;transition:opacity .35s ease;text-align:center;";
    card.innerHTML =
      '<div style="font-size:15px;letter-spacing:3px;opacity:.7;text-transform:uppercase">HireStream · HPSEDC Overseas Placement Portal</div>' +
      '<div style="font-size:44px;font-weight:800;padding:0 8%">' + title + '</div>' +
      '<div style="font-size:20px;font-weight:500;opacity:.85;padding:0 10%">' + sub + '</div>' +
      '<div style="position:fixed;bottom:6%;font-size:13px;letter-spacing:2px;opacity:.55;text-transform:uppercase">' + foot + '</div>';
    (document.body || document.documentElement).appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; });
  }, { title, sub, foot });
  await page.waitForTimeout(holdMs);
  if (fadeOut) {
    await page.evaluate(() => {
      const c = document.getElementById("pw-title");
      if (c) { c.style.opacity = "0"; setTimeout(() => c.remove(), 400); }
    });
    await page.waitForTimeout(450);
  }
}

/** Clean screenshot for the printed guide: hide film overlays, shoot, restore. */
export async function snap(page: Page, dir: string, name: string, opts: { full?: boolean; locator?: string } = {}) {
  // Full-page captures stitch the page, so a sticky header would be painted
  // mid-page: unstick it for the shot.
  if (opts.full) await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const pos = getComputedStyle(el).position;
      if ((pos === "sticky" || pos === "fixed") && !el.id.startsWith("pw-")) {
        el.dataset.pwPos = el.style.position || "-"; el.style.position = pos === "sticky" ? "relative" : "absolute";
      }
    });
  }).catch(() => {});
  await page.evaluate(() => {
    for (const id of ["pw-cursor", "pw-caption"]) {
      const el = document.getElementById(id) as HTMLElement | null;
      if (el) el.style.visibility = "hidden";
    }
  }).catch(() => {});
  const path = `${dir}/${name}.png`;
  try {
    if (opts.locator) await page.locator(opts.locator).first().screenshot({ path });
    else await page.screenshot({ path, fullPage: !!opts.full });
  } catch { /* a missed guide image must never kill the film */ }
  await page.evaluate(() => {
    for (const id of ["pw-cursor", "pw-caption"]) {
      const el = document.getElementById(id) as HTMLElement | null;
      if (el) el.style.visibility = "visible";
    }
    document.querySelectorAll<HTMLElement>("[data-pw-pos]").forEach((el) => {
      el.style.position = el.dataset.pwPos === "-" ? "" : (el.dataset.pwPos || "");
      delete el.dataset.pwPos;
    });
  }).catch(() => {});
}
