import type { Request, Response, NextFunction } from "express";

/**
 * Strip dangerous HTML tags and event handlers from user-supplied strings.
 * Recursively walks request body and query, applying to all string values.
 *
 * Keeps text content; removes <script>, <iframe>, <object>, <embed>, on* handlers,
 * and javascript: URLs. This is defence-in-depth — rendering layers should also escape.
 *
 * Skips: passwords, tokens, OTP codes, file uploads, base64 data.
 */

const DANGEROUS_TAG_RE = /<(script|iframe|object|embed|link|style|meta|form)\b[^>]*>([\s\S]*?<\/\1>)?/gi;
const EVENT_HANDLER_RE = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;
const JS_URL_RE = /javascript\s*:/gi;
const DATA_URL_RE = /data\s*:\s*text\/html/gi;

const SKIP_FIELDS = new Set([
  "password", "passwordHash", "currentPassword", "newPassword", "confirmPassword",
  "token", "resetToken", "csrfToken", "otp", "otpCode",
  "file", "fileData", "base64", "captchaToken",
]);

function sanitizeString(value: string): string {
  if (typeof value !== "string") return value;
  return value
    .replace(DANGEROUS_TAG_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(JS_URL_RE, "removed:")
    .replace(DATA_URL_RE, "data:text/plain");
}

function sanitizeValue(value: any, key?: string): any {
  if (value == null) return value;
  if (key && SKIP_FIELDS.has(key)) return value;

  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(v => sanitizeValue(v));
  }
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeValue(v, k);
    }
    return out;
  }
  return value;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  // Skip multipart (file uploads) — multer handles those
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return next();
  }

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    // req.query is read-only in modern Express, mutate in place instead of reassigning
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") {
        (req.query as any)[k] = sanitizeString(v);
      }
    }
  }
  next();
}
