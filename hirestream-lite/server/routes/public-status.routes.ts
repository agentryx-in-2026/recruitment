/**
 * Public application status check — no login required.
 * Flow: candidate enters phone → we send OTP → they enter OTP + application
 * reference number → we return read-only status. Designed for rural users
 * who've lost their password and for families tracking deployed workers.
 *
 * Security: rate-limited OTPs, OTPs expire in 10 minutes, reference must
 * belong to the same phone number. No session is issued — this is a single
 * read, not a login.
 */

import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { applications, candidates, jobs, placements, otpCodes } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";
import { sendOtpSms } from "../services/sms.service";
import { logger } from "../config/logger.config";

const router = Router();

function genOtp() {
  // audit 2026-07-06 (S5): crypto-strong OTP rather than Math.random().
  return String(crypto.randomInt(100000, 1000000));
}

// Quick in-memory rate limit: 3 requests per phone per 10 min.
const rateMap = new Map<string, { count: number; firstAt: number }>();
function rateLimited(phone: string): boolean {
  const now = Date.now();
  const r = rateMap.get(phone);
  if (!r || now - r.firstAt > 600_000) { rateMap.set(phone, { count: 1, firstAt: now }); return false; }
  r.count += 1;
  return r.count > 3;
}

// audit 2026-07-06 (S5): cap failed /check attempts per phone so a single
// issued OTP can't be brute-forced (6-digit space over a 10-min window).
// After MAX_VERIFY_FAILS wrong guesses we burn all of that phone's tokens
// and force a fresh OTP request.
const MAX_VERIFY_FAILS = 5;
const verifyFailMap = new Map<string, { count: number; firstAt: number }>();
function recordVerifyFail(phone: string): number {
  const now = Date.now();
  const r = verifyFailMap.get(phone);
  if (!r || now - r.firstAt > 600_000) { verifyFailMap.set(phone, { count: 1, firstAt: now }); return 1; }
  r.count += 1;
  return r.count;
}
function clearVerifyFails(phone: string) { verifyFailMap.delete(phone); }

// POST /api/v1/public/status/request-otp  { phone }
router.post("/request-otp", async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    if (!/^\+?\d{8,15}$/.test(phone.replace(/\D/g, "").length >= 8 ? phone : "")) {
      return res.status(400).json({ success: false, message: "Enter a valid phone number with country code." });
    }
    if (rateLimited(phone)) {
      return res.status(429).json({ success: false, message: "Too many OTP requests. Try again in 10 minutes." });
    }
    const otp = genOtp();
    const db = storage.db!;
    // Store keyed by a phone-prefixed email field so we don't collide with
    // real-email OTP flows.
    await db.insert(otpCodes).values({
      email: `status:${phone}`, code: otp, purpose: "status_check", expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    sendOtpSms(phone, otp).catch((e) => logger.warn(`public-status OTP SMS failed: ${e?.message}`));
    logger.info(`public-status OTP issued to ${phone}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/v1/public/status/check  { phone, otp, reference }
// reference = application id OR first 8 chars of application id
router.post("/check", async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const reference = String(req.body?.reference || "").trim();
    if (!phone || !otp || !reference) {
      return res.status(400).json({ success: false, message: "phone, otp, and reference are all required." });
    }
    const db = storage.db!;

    // S5: too many wrong guesses → lock out until a fresh OTP is requested.
    const fails = verifyFailMap.get(phone);
    if (fails && Date.now() - fails.firstAt <= 600_000 && fails.count >= MAX_VERIFY_FAILS) {
      return res.status(429).json({ success: false, message: "Too many incorrect attempts. Request a new code." });
    }

    const [token] = await db.select().from(otpCodes).where(and(
      eq(otpCodes.email, `status:${phone}`),
      eq(otpCodes.code, otp),
      gte(otpCodes.expiresAt, new Date()),
    )).limit(1);
    if (!token) {
      const n = recordVerifyFail(phone);
      if (n >= MAX_VERIFY_FAILS) {
        // Burn all outstanding tokens for this phone on lockout.
        await db.delete(otpCodes).where(eq(otpCodes.email, `status:${phone}`));
      }
      return res.status(401).json({ success: false, message: "OTP is invalid or expired." });
    }

    // Correct OTP — burn the token so it can't be reused, and clear failures.
    await db.delete(otpCodes).where(eq(otpCodes.id, token.id));
    clearVerifyFails(phone);

    // Find the candidate via phone, then the application via reference.
    const phoneTail = phone.replace(/\D/g, "").slice(-10);
    const [cand] = await db.select().from(candidates)
      .where(eq(candidates.phone, phoneTail)).limit(1);
    if (!cand) {
      // Also try full phone string.
      const [c2] = await db.select().from(candidates).where(eq(candidates.phone, phone)).limit(1);
      if (!c2) return res.status(404).json({ success: false, message: "No application found for that phone number." });
      return await lookupAndRespond(c2.id, reference, res);
    }
    return await lookupAndRespond(cand.id, reference, res);
  } catch (err) { next(err); }
});

async function lookupAndRespond(candidateId: string, reference: string, res: any) {
  const db = storage.db!;
  const apps = await db.select({
    application: applications, job: jobs,
  }).from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(applications.candidateId, candidateId));

  const ref = reference.toLowerCase();
  const match = apps.find((r: any) => r.application.id.toLowerCase() === ref || r.application.id.startsWith(ref));
  if (!match) {
    return res.status(404).json({ success: false, message: "Application reference not found under this phone number." });
  }

  // Attach placement if any
  const [place] = await db.select().from(placements).where(eq(placements.applicationId, match.application.id)).limit(1);

  return res.json({
    success: true,
    data: {
      reference: match.application.id.slice(0, 8),
      status: match.application.status,
      jobTitle: match.job.title,
      jobCountry: match.job.country,
      appliedAt: match.application.appliedAt,
      // Redact employer name where the candidate shouldn't see it yet —
      // mirrors the PWS "hide_employer_in_negatives" rule.
      placement: place ? {
        status: place.status,
        country: place.country,
        startDate: place.startDate,
      } : null,
    },
  });
}

export default router;
