import rateLimit from "express-rate-limit";
import { getSettingSync } from "../services/settings.service";

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";
const isLoose = isDev || isTest;

// Read limit from system_settings cache (invalidated whenever admin updates it).
// Changes take effect on the next request — no server restart required.
function limitFrom(key: string, fallback: number) {
  return () => {
    if (isLoose) return 50000;
    const v = getSettingSync<number>(key);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitFrom("ratelimit.api_per_15min", 2000),
  message: {
    success: false,
    error: { code: 429, message: "Too many requests from this IP, please try again after 15 minutes" },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitFrom("ratelimit.auth_attempts_per_15min", 200),
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: { code: 429, message: "Too many failed authentication attempts from this IP. Please wait a few minutes and try again." },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitFrom("ratelimit.sensitive_per_15min", 50),
  message: {
    success: false,
    error: { code: 429, message: "Too many sensitive operations from this IP. Please wait 15 minutes." },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

