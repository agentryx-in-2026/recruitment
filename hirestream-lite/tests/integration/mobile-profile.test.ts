/**
 * Mobile Profile API Integration Tests
 *
 * Covers GET + PATCH /api/v1/mobile/profile.
 *
 * Born from v0.4.11.0 — the PATCH used to write to `users.fullName` which
 * doesn't exist, returning success but persisting nothing. Mobile UI showed
 * "Saved" while the DB was untouched, and the next GET returned the email
 * prefix because `users.fullName` was always undefined.
 *
 * These tests guard the canonical contract:
 *   - GET reads candidate-specific fields from `candidates` (not `users`)
 *   - PATCH writes fullName / phone / location to `candidates`
 *   - PATCH writes preferredLanguage to `users`
 *   - Round-trip persists across a second GET (the bug the user reported)
 */

import { describe, beforeEach, it, expect } from "@jest/globals";
import supertest from "supertest";
import { createTestApp, truncateAllTables, getDb } from "../helpers";
import { candidates, users } from "../../shared/schema";
import { eq } from "drizzle-orm";

const app = createTestApp();
const request = supertest(app);

const TEST_USER = {
  email: "mobile-profile@example.com",
  password: "TestPass1!",
  role: "candidate" as const,
  fullName: "Initial Name",
};

async function registerAndLogin() {
  const res = await request.post("/api/v1/mobile/auth/register").send(TEST_USER);
  expect(res.status).toBe(201);
  return res.body.data; // { accessToken, refreshToken, user }
}

describe("Mobile Profile API (/api/v1/mobile/profile)", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("GET returns the real candidate fullName (not the email prefix)", async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request
      .get("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe("Initial Name");
    // Belt-and-suspenders — the bug we fixed used to return the email-prefix
    // ("mobile-profile") in fullName when the real name was set.
    expect(res.body.data.fullName).not.toBe("mobile-profile");
  });

  it("PATCH fullName persists to candidates table + survives a fresh GET", async () => {
    const { accessToken } = await registerAndLogin();

    const patch = await request
      .patch("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "Updated Name From Mobile" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.fullName).toBe("Updated Name From Mobile");

    // The HPSEDC bug: PATCH said success, but next GET returned old value.
    // This is the regression check.
    const fetched = await request
      .get("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(fetched.body.data.fullName).toBe("Updated Name From Mobile");

    // And verify directly in DB — paranoia is justified after that bug.
    const db = getDb();
    const [row] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.email, TEST_USER.email))
      .limit(1);
    expect(row?.fullName).toBe("Updated Name From Mobile");
  });

  it("PATCH phoneNumber validates the format + persists to candidates.phone", async () => {
    const { accessToken } = await registerAndLogin();

    // Garbage phone (HTIS BUG-002 class) — reject with the specific message
    const bad = await request
      .patch("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phoneNumber: "87698GBIUHJIUJN" });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.message).toMatch(/phone/i);

    // Good phone — sticks
    const good = await request
      .patch("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phoneNumber: "+91 9876543210" });
    expect(good.status).toBe(200);
    expect(good.body.data.phoneNumber).toBe("+91 9876543210");

    // Persists across a fresh GET
    const fetched = await request
      .get("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(fetched.body.data.phoneNumber).toBe("+91 9876543210");
  });

  it("PATCH preferredLanguage persists to users (not candidates)", async () => {
    const { accessToken } = await registerAndLogin();

    const patch = await request
      .patch("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ preferredLanguage: "hi" });
    expect(patch.status).toBe(200);

    // Verify it landed on users, not candidates
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, TEST_USER.email))
      .limit(1);
    expect((u as any).preferredLanguage).toBe("hi");
  });

  it("PATCH with no valid fields returns 400 (no silent no-op)", async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request
      .patch("/api/v1/mobile/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ randomField: "ignored" });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/no valid fields/i);
  });

  it("GET + PATCH require auth (401 without bearer)", async () => {
    const g = await request.get("/api/v1/mobile/profile");
    expect(g.status).toBe(401);
    const p = await request.patch("/api/v1/mobile/profile").send({ fullName: "x" });
    expect(p.status).toBe(401);
  });
});
