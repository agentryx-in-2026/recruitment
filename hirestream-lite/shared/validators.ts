import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(120, "Email too long"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  role: z.enum(["candidate", "agent", "employer"]),
  phone: z.string().trim().max(20).optional(),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100, "Name too long").optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Please enter your username or email").max(120),
  password: z.string().min(1, "Password is required").max(128),
});

export const otpSchema = z.object({
  email: z.string().trim().email().max(120),
  otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
  // Must match the purpose the code was ISSUED under — verifyOtp filters on it,
  // so a code sent as "register" is invisible to a lookup for "login". The
  // default MIRRORS send-otp's default ("login") so the pair agrees when
  // neither side specifies; flows that issue under another purpose pass it
  // explicitly on both calls.
  purpose: z.enum(["login", "register", "password_reset"]).default("login"),
});
