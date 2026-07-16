/**
 * Phase 4 Operator Console — end-to-end UI + API flow.
 *
 * Covers:
 *   1. Status tab renders all 4 cards (synthetic / digest / triage / log search)
 *   2. System Config tab renders 6 feature cards
 *   3. Test Connection button on llm_triage hits the live LLM and returns OK
 *   4. Toggle enable on a feature persists across page reload
 *   5. Non-superadmin cannot read /api/v1/admin/system-config (403)
 *   6. Unauthenticated cannot read it either (401)
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers";

const FEATURES = [
  "synthetic_monitor",
  "llm_triage",
  "daily_digest",
  "loki",
  "notifications",
];

test.describe("Operator Console — superadmin access", () => {
  test("status tab renders synthetic / digest / triage / log search cards", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");
    await page.goto("/admin/operator-console");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Page title visible
    await expect(page.locator("text=Operator Console").first()).toBeVisible({ timeout: 10000 });

    // Status tab is default — four cards
    await expect(page.locator("text=Synthetic Monitor").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Daily Digest").first()).toBeVisible();
    await expect(page.locator("text=LLM Triage").first()).toBeVisible();
    await expect(page.locator("text=Log Search").first()).toBeVisible();
  });

  test("system config tab renders all 5 feature cards", async ({ page }) => {
    await loginAs(page, "superadmin", "hpsedc@super2026");
    await page.goto("/admin/operator-console");

    // Switch to System Config tab
    await page.getByRole("tab", { name: /system config/i }).click();
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    // All five feature labels visible (DocuMind dropped in v0.7.x — different app).
    await expect(page.locator("text=Synthetic Monitor").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=LLM Triage").first()).toBeVisible();
    await expect(page.locator("text=Daily Log Digest").first()).toBeVisible();
    await expect(page.locator("text=Loki").first()).toBeVisible();
    await expect(page.locator("text=Notifications").first()).toBeVisible();
  });

  test("Test button on llm_triage card returns OK from the live LLM", async ({ page }) => {
    // LLM round-trip can take up to 20s on a warm Mistral, 90s cold — bump
    // the overall test timeout from the 30s default.
    test.setTimeout(180000);
    await loginAs(page, "superadmin", "hpsedc@super2026");
    await page.goto("/admin/operator-console");
    await page.getByRole("tab", { name: /system config/i }).click();

    // Scope to the LLM Triage card by walking up to the shadcn Card root
    // (rounded-xl wrapper) — avoids matching the other 5 cards' Test buttons.
    const llmCard = page
      .locator('[class*="rounded-xl"]')
      .filter({ hasText: "LLM Triage" })
      .filter({ hasNot: page.locator("text=DocuMind") }); // exclude grid container
    await llmCard.first().getByRole("button", { name: /^test$/i }).click();

    // Wait for "OK" badge inside this same card (≤90s — Mistral 7B CPU latency)
    await expect(llmCard.first().locator("text=/✓ OK/")).toBeVisible({ timeout: 90000 });
  });
});

test.describe("Operator Console — API smoke (superadmin)", () => {
  test("GET /api/v1/admin/system-config returns 6 feature rows", async ({ request }) => {
    const login = await request.post("/api/v1/auth/login", {
      data: { username: "superadmin", password: "hpsedc@super2026" },
    });
    expect(login.ok()).toBeTruthy();

    const r = await request.get("/api/v1/admin/system-config");
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(5);
    const features = body.data.map((d: any) => d.feature).sort();
    expect(features).toEqual([...FEATURES].sort());
  });

  test("PUT /api/v1/admin/system-config/:feature persists enabled toggle", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "superadmin", password: "hpsedc@super2026" },
    });

    // Read current state for notifications (safe target — toggling enabled is
    // harmless; the /test endpoint has side effects only if slackWebhookUrl
    // is set, which it isn't by default)
    const before = await (await request.get("/api/v1/admin/system-config/notifications")).json();
    const original = before.data.enabled;

    // Flip it
    const flip = await request.put("/api/v1/admin/system-config/notifications", {
      data: { enabled: !original },
    });
    expect(flip.ok()).toBeTruthy();
    expect((await flip.json()).data.enabled).toBe(!original);

    // Confirm via GET
    const after = await (await request.get("/api/v1/admin/system-config/notifications")).json();
    expect(after.data.enabled).toBe(!original);

    // Restore
    await request.put("/api/v1/admin/system-config/notifications", { data: { enabled: original } });
  });

  test("POST /api/v1/admin/system-config/llm_triage/test returns ok=true from live Nexus", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "superadmin", password: "hpsedc@super2026" },
    });
    const r = await request.post("/api/v1/admin/system-config/llm_triage/test");
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(body.data.latencyMs).toBeGreaterThan(0);
    // Latency is high — Mistral CPU inference takes 1-15s typically
    expect(body.data.latencyMs).toBeLessThan(90000);
  });

  test("GET /api/v1/admin/operator-console/status returns the 3 JSON snapshots", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "superadmin", password: "hpsedc@super2026" },
    });
    const r = await request.get("/api/v1/admin/operator-console/status");
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("synthetic");
    expect(body.data).toHaveProperty("digest");
    expect(body.data).toHaveProperty("triage");
    expect(body.data).toHaveProperty("generatedAt");
  });
});

test.describe("Operator Console — authorization", () => {
  test("non-superadmin (admin) blocked from system-config API", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "demo_admin", password: "test123" },
    });
    const r = await request.get("/api/v1/admin/system-config");
    expect(r.status()).toBe(403);
  });

  test("non-superadmin (candidate) blocked from system-config API", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "demo_candidate", password: "test123" },
    });
    const r = await request.get("/api/v1/admin/system-config");
    expect(r.status()).toBe(403);
  });

  test("unauthenticated blocked from system-config API", async ({ request }) => {
    const r = await request.get("/api/v1/admin/system-config");
    expect(r.status()).toBe(401);
  });

  test("non-superadmin blocked from operator-console/status", async ({ request }) => {
    await request.post("/api/v1/auth/login", {
      data: { username: "demo_admin", password: "test123" },
    });
    const r = await request.get("/api/v1/admin/operator-console/status");
    expect(r.status()).toBe(403);
  });
});
