/**
 * Mobile API coverage sweep — round-trip tests for every endpoint under
 * /api/v1/mobile/* that wasn't already covered by mobile-auth.test.ts or
 * mobile-profile.test.ts.
 *
 * Born from the v0.4.11 retro: we had 3 mobile bugs in one day (photo
 * upload error UX, registration validation UX, profile PATCH writing to
 * the wrong table) and the common thread was "the mobile route is
 * untouched by jest". This file closes the gap so future regressions are
 * caught in CI, not by an HPSEDC tester on a phone.
 *
 * Endpoints covered:
 *   GET    /api/v1/mobile/version           — version gating envelope
 *   GET    /api/v1/mobile/config            — feature flags
 *   GET    /api/v1/mobile/notifications     — auto-seeds welcome on first read
 *   PATCH  /api/v1/mobile/notifications/:id/read
 *   PATCH  /api/v1/mobile/notifications/read-all
 *   DELETE /api/v1/mobile/account           — soft-delete + PII anonymise
 *                                              (regression check on the
 *                                              v0.4.12.0 fix: candidate
 *                                              row's full_name + phone
 *                                              MUST be cleared)
 *   POST   /api/v1/mobile/push/register     — upsert push token
 *   DELETE /api/v1/mobile/push/register     — delete on logout
 */

import { describe, beforeEach, it, expect } from "@jest/globals";
import supertest from "supertest";
import { createTestApp, truncateAllTables, getDb } from "../helpers";
import { candidates, users, mobilePushTokens } from "../../shared/schema";
import { eq } from "drizzle-orm";

const app = createTestApp();
const request = supertest(app);

const TEST_USER = {
  email: "mobile-sweep@example.com",
  password: "TestPass1!",
  role: "candidate" as const,
  fullName: "Sweep Test",
};

async function registerAndLogin() {
  const res = await request.post("/api/v1/mobile/auth/register").send(TEST_USER);
  expect(res.status).toBe(201);
  return res.body.data; // { accessToken, refreshToken, user }
}

describe("Mobile API coverage sweep", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // ── GET /version ──────────────────────────────────────────────────
  it("GET /version returns minSupported + latest from env", async () => {
    const res = await request.get("/api/v1/mobile/version");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.minSupported).toBe("string");
    expect(typeof res.body.data.latest).toBe("string");
    expect(typeof res.body.data.forceUpdate).toBe("boolean");
  });

  // ── GET /config ───────────────────────────────────────────────────
  it("GET /config returns the feature-flag envelope", async () => {
    const res = await request.get("/api/v1/mobile/config");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.flags).toBeDefined();
    expect(typeof res.body.data.flags.photoUploadEnabled).toBe("boolean");
    expect(typeof res.body.data.flags.pushNotificationsEnabled).toBe("boolean");
  });

  // ── /notifications round-trip ─────────────────────────────────────
  describe("notifications", () => {
    it("GET auto-seeds a welcome notification on first read", async () => {
      const { accessToken } = await registerAndLogin();
      const r = await request
        .get("/api/v1/mobile/notifications")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(r.status).toBe(200);
      expect(r.body.data.notifications.length).toBeGreaterThan(0);
      // Welcome + profile-tip seeded on the first visit
      const titles = r.body.data.notifications.map((n: any) => n.title);
      expect(titles).toEqual(expect.arrayContaining([expect.stringMatching(/welcome/i)]));
    });

    it("PATCH /:id/read flips a single row to read=true; survives re-fetch", async () => {
      const { accessToken } = await registerAndLogin();
      // First GET seeds rows
      const seed = await request
        .get("/api/v1/mobile/notifications")
        .set("Authorization", `Bearer ${accessToken}`);
      const target = seed.body.data.notifications[0];
      expect(target.isRead).toBe(false);

      const patch = await request
        .patch(`/api/v1/mobile/notifications/${target.id}/read`)
        .set("Authorization", `Bearer ${accessToken}`);
      expect(patch.status).toBe(200);

      // Round-trip — fetch again, confirm the flag stuck
      const after = await request
        .get("/api/v1/mobile/notifications")
        .set("Authorization", `Bearer ${accessToken}`);
      const row = after.body.data.notifications.find((n: any) => n.id === target.id);
      expect(row.isRead).toBe(true);
    });

    it("PATCH /read-all marks every row read", async () => {
      const { accessToken } = await registerAndLogin();
      await request
        .get("/api/v1/mobile/notifications")
        .set("Authorization", `Bearer ${accessToken}`); // seed

      const patch = await request
        .patch("/api/v1/mobile/notifications/read-all")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(patch.status).toBe(200);

      const after = await request
        .get("/api/v1/mobile/notifications")
        .set("Authorization", `Bearer ${accessToken}`);
      const stillUnread = after.body.data.notifications.filter((n: any) => !n.isRead);
      expect(stillUnread.length).toBe(0);
    });

    it("auth required (401 without bearer)", async () => {
      const r = await request.get("/api/v1/mobile/notifications");
      expect(r.status).toBe(401);
    });
  });

  // ── DELETE /account ─ regression for v0.4.12.0 PII fix ────────────
  describe("account deletion", () => {
    it("anonymizes BOTH users row AND candidates row (Play Store compliance)", async () => {
      const { accessToken, user } = await registerAndLogin();

      // Set some richer PII so we can assert it's actually cleared
      await request
        .patch("/api/v1/mobile/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ fullName: "Real Name For Audit", phoneNumber: "+91 9876543210", location: "Shimla" });

      const del = await request
        .delete("/api/v1/mobile/account")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(del.status).toBe(200);
      expect(del.body.success).toBe(true);

      const db = getDb();
      // users row anonymized
      const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      expect((u as any).isActive).toBe(false);
      expect((u as any).email).toMatch(/^deleted-.*@hirestream\.deleted$/);
      expect((u as any).username).toMatch(/^deleted-/);

      // candidates row anonymized — this is the v0.4.12.0 fix.
      // Before the fix, full_name + phone survived in plain text.
      const [c] = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
      expect((c as any).fullName).toBe("Deleted Candidate");
      expect((c as any).phone).toBeNull();
      expect((c as any).location).toBeNull();
      expect((c as any).photoUrl).toBeNull();
      expect((c as any).fullName).not.toBe("Real Name For Audit");
    });

    it("requires auth", async () => {
      const r = await request.delete("/api/v1/mobile/account");
      expect(r.status).toBe(401);
    });
  });

  // ── Push token register / delete ──────────────────────────────────
  describe("push token", () => {
    it("POST /push/register upserts a token; second call updates the same row", async () => {
      const { accessToken, user } = await registerAndLogin();
      const payload = { platform: "android", token: "ExponentPushToken[abcdefghij1234567890]" };

      const first = await request
        .post("/api/v1/mobile/push/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(payload);
      expect(first.status).toBe(200);

      // Same token a second time — should NOT create a duplicate row
      const second = await request
        .post("/api/v1/mobile/push/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ ...payload, appVersion: "0.4.11.0" });
      expect(second.status).toBe(200);

      const db = getDb();
      const rows = await db
        .select()
        .from(mobilePushTokens)
        .where(eq(mobilePushTokens.userId, user.id));
      expect(rows.length).toBe(1);
      expect((rows[0] as any).appVersion).toBe("0.4.11.0");
    });

    it("DELETE /push/register removes the token (logout flow)", async () => {
      const { accessToken, user } = await registerAndLogin();
      const token = "ExponentPushToken[xyz000000000000000000]";
      await request
        .post("/api/v1/mobile/push/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ platform: "ios", token });

      const del = await request
        .delete("/api/v1/mobile/push/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ token });
      expect(del.status).toBe(200);

      const db = getDb();
      const rows = await db
        .select()
        .from(mobilePushTokens)
        .where(eq(mobilePushTokens.userId, user.id));
      expect(rows.length).toBe(0);
    });

    it("invalid platform → 400 (Zod validation)", async () => {
      const { accessToken } = await registerAndLogin();
      const r = await request
        .post("/api/v1/mobile/push/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ platform: "windows", token: "ExponentPushToken[xxx0000000000000000]" });
      expect(r.status).toBe(400);
    });
  });
});
