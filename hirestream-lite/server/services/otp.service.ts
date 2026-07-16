import crypto from "crypto";
import { storage } from "../storage";
import { otpCodes } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { sendOtpEmail } from "./email.service";
import { sendOtpSms } from "./sms.service";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically random 6-digit OTP.
 */
function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Create and send an OTP to the given email (and optionally phone).
 */
export async function createAndSendOtp(
  email: string,
  purpose: string = "login",
  phone?: string
): Promise<{ success: boolean; message: string }> {
  const db = storage.db;
  if (!db) return { success: false, message: "Database not available" };

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Store OTP in database
  await db.insert(otpCodes).values({
    email,
    code: otp,
    purpose,
    expiresAt,
  });

  // Send via email
  const emailSent = await sendOtpEmail(email, otp);

  // Send via SMS if phone provided
  if (phone) {
    await sendOtpSms(phone, otp);
  }

  if (!emailSent) {
    return { success: false, message: "Failed to send OTP email" };
  }

  logger.info(`OTP created for ${email} (purpose: ${purpose})`);
  return { success: true, message: "OTP sent successfully" };
}

/**
 * Verify an OTP code for the given email.
 */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: string = "login"
): Promise<{ success: boolean; message: string }> {
  const db = storage.db;
  if (!db) return { success: false, message: "Database not available" };

  // Find the most recent unexpired, unverified OTP for this email + purpose
  const results = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.purpose, purpose),
        eq(otpCodes.verified, false),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(otpCodes.createdAt)
    .limit(1);

  if (results.length === 0) {
    return { success: false, message: "No valid OTP found. Please request a new one." };
  }

  const otpRecord = results[0];

  // Check max attempts
  if ((otpRecord.attempts || 0) >= MAX_ATTEMPTS) {
    return { success: false, message: "Too many attempts. Please request a new OTP." };
  }

  // Increment attempts
  await db
    .update(otpCodes)
    .set({ attempts: (otpRecord.attempts || 0) + 1 })
    .where(eq(otpCodes.id, otpRecord.id));

  // Compare code
  if (otpRecord.code !== code) {
    return { success: false, message: "Invalid OTP code" };
  }

  // Mark as verified
  await db
    .update(otpCodes)
    .set({ verified: true })
    .where(eq(otpCodes.id, otpRecord.id));

  logger.info(`OTP verified for ${email} (purpose: ${purpose})`);
  return { success: true, message: "OTP verified successfully" };
}
