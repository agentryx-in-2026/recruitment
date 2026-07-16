import nodemailer from "nodemailer";
import { env } from "../config/env.config";
import { logger } from "../config/logger.config";
import { getProviderConfig } from "./provider-config.service";

// Transporter is rebuilt from whatever the admin saved (falls back to env).
// The cache key is a fingerprint of host/port/user/pass/secure — changing any
// of those via setProviderConfig invalidates the cached transporter on the
// NEXT resolve (we don't need provider-config.service to signal us). Previous
// version only invalidated when the source switched (db↔env), so a password
// save was silently ignored until server restart.
let cachedTransporter: nodemailer.Transporter | null = null;
let cachedFrom: string | null = null;
let cachedKey: string | null = null;

async function resolveTransporter(): Promise<{ transporter: nodemailer.Transporter | null; from: string; source: string }> {
  const p = await getProviderConfig("email");
  const source = p?.source ?? "none";

  if (!p?.enabled) {
    cachedTransporter = null; cachedKey = null;
    cachedFrom = env.SMTP_FROM || "noreply@hirestream.osipl.dev";
    return { transporter: null, from: cachedFrom, source };
  }

  // .trim() on every field. Browser paste from provider dashboards (Mailtrap,
  // SMTP2GO, Brevo) frequently captures a trailing newline or space that SMTP
  // AUTH treats as part of the password — 535 "Incorrect authentication data"
  // is the inevitable result and there's no way to know without hex-dumping
  // the stored secret. Defensive trim here matches what we did for Twilio.
  const host = String(p.config.host || env.SMTP_HOST || "").trim();
  const port = Number(String(p.config.port || env.SMTP_PORT || 587).toString().trim());
  const user = String(p.config.user || env.SMTP_USER || "").trim();
  const pass = String(p.secrets.pass || env.SMTP_PASS || "").trim();
  const from = String(p.config.from || env.SMTP_FROM || "noreply@hirestream.osipl.dev").trim();
  const secure = port === 465 || p.config.secure === true;

  if (!host) {
    cachedTransporter = null; cachedKey = null;
    cachedFrom = from;
    return { transporter: null, from, source };
  }

  // Fingerprint bound to the auth material — NOT the raw password in plaintext
  // (leaking via a log line is easy). Short hash of user|host|port|pass|secure
  // uniquely identifies this config state.
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(`${host}|${port}|${user}|${pass}|${secure}|${source}`).digest("hex").slice(0, 16);

  if (cachedTransporter && cachedKey === key) {
    return { transporter: cachedTransporter, from: cachedFrom || from, source };
  }

  cachedTransporter = nodemailer.createTransport({
    host, port, secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  cachedFrom = from;
  cachedKey = key;
  return { transporter: cachedTransporter, from, source };
}

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: SendMailOptions): Promise<boolean> {
  const { transporter, from } = await resolveTransporter();

  if (!transporter) {
    // Dev mode — log the email instead of sending
    logger.info(`[EMAIL-DEV] To: ${options.to} | Subject: ${options.subject}`);
    logger.debug(`[EMAIL-DEV] Body: ${options.text}`);
    return true;
  }

  try {
    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    });
    logger.info(`Email sent to ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    logger.error(`Email failed to ${options.to}: ${error}`);
    return false;
  }
}

// Test-connection helper used by the admin Integrations panel. Verifies that
// the currently-saved config can actually open an SMTP session, without
// actually sending a message.
export async function testEmailConnection(to?: string): Promise<{ ok: boolean; error?: string; info?: string }> {
  const { transporter, from } = await resolveTransporter();
  if (!transporter) return { ok: false, error: "Email is not configured." };
  try {
    await transporter.verify();
    // If a recipient is supplied, actually send a small deliverability probe
    // so the admin can confirm end-to-end delivery (inbox placement, spam
    // folder, Mailtrap capture). Without a recipient, fall back to the
    // handshake-only verify — same as before — so existing callers keep the
    // previous semantics.
    if (to && to.trim()) {
      const dest = to.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest)) {
        return { ok: false, error: "Recipient email looks malformed — expected like user@example.com" };
      }
      const now = new Date().toISOString();
      const result = await transporter.sendMail({
        from,
        to: dest,
        subject: `HireStream — Test email (${now})`,
        text: `This is a test email from HireStream staging.\n\nSent: ${now}\nFrom: ${from}\nTo: ${dest}\n\nIf you received this, SMTP delivery is working end-to-end.`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1a56db;">HireStream — Test email</h2>
          <p>This is a test email from HireStream staging.</p>
          <table style="font-size:12px;color:#475569;margin-top:16px;">
            <tr><td style="padding:2px 8px 2px 0;">Sent:</td><td><code>${now}</code></td></tr>
            <tr><td style="padding:2px 8px 2px 0;">From:</td><td><code>${from}</code></td></tr>
            <tr><td style="padding:2px 8px 2px 0;">To:</td><td><code>${dest}</code></td></tr>
          </table>
          <p style="color:#64748b;font-size:12px;margin-top:16px;">If you received this in your inbox, SMTP delivery is working end-to-end. If it landed in spam, check your sender-domain verification on the provider.</p>
        </div>`,
      });
      return { ok: true, info: `Sent to ${dest} (messageId ${result?.messageId || "n/a"}).` };
    }
    return { ok: true, info: "Handshake OK. Provide a recipient to test actual delivery." };
  } catch (err: any) {
    // 535 is SMTP's "authentication credentials invalid" — ubiquitous enough
    // across providers that we translate it into a plain-English checklist so
    // the admin doesn't have to guess whether the problem is user, password,
    // account activation, or an API-key-vs-SMTP-user mixup. The raw provider
    // message (nodemailer includes the SMTP response text in err.message) is
    // appended so support still has the actual line from the wire.
    const raw = err?.message || String(err);
    const is535 = /\b535\b/.test(raw);
    if (is535) {
      return {
        ok: false,
        error:
          "SMTP 535 — the provider rejected your username/password. Common causes: " +
          "(1) password has a trailing space from the paste (we now trim, but the SAVED value might still have one — re-paste it fresh); " +
          "(2) you created an 'API Key' on the provider dashboard instead of an 'SMTP User' — SMTP2GO, Brevo, and Mailgun use DIFFERENT credentials for each; " +
          "(3) account is not yet verified (check your signup email for a confirmation link); " +
          "(4) the username is case-sensitive on some providers. " +
          `Raw response: ${raw.slice(0, 200)}`,
      };
    }
    return { ok: false, error: raw };
  }
}

export async function sendOtpEmail(email: string, otp: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `HireStream - Your verification code is ${otp}`,
    text: `Your HireStream verification code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a56db;">HireStream</h2>
        <p>Your verification code is:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a56db;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">If you did not request this code, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">HPSEDC Overseas Placement Portal</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${resetToken}`;

  return sendEmail({
    to: email,
    subject: "HireStream - Password Reset Request",
    text: `You requested a password reset for your HireStream account.\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a56db;">HireStream</h2>
        <p>You requested a password reset for your account.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #1a56db; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Reset Password</a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px;">If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">HPSEDC Overseas Placement Portal</p>
      </div>
    `,
  });
}
