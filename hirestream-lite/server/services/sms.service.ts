import { logger } from "../config/logger.config";
import { getProviderConfig } from "./provider-config.service";

/**
 * SMS Service — reads live config from provider_config (admin-editable), with
 * env as a last-resort fallback for local dev.
 *
 * Supported provider types (growing as agencies provision credentials):
 *   - "mock"     → dev-only, logs to console
 *   - "msg91"    → MSG91 HTTP API (most common for Indian deployments)
 *   - "twilio"   → Twilio SMS
 *   - "gupshup"  → Gupshup enterprise SMS
 *   - "nic"      → NIC SMS gateway (HP state govt, when credentials available)
 *
 * Adding a new provider = one new sender function + a case in the switch below.
 * The admin UI at /admin/integrations exposes the fields each provider needs.
 */

async function sendViaMsg91(phone: string, message: string, cfg: any, sec: any): Promise<{ ok: boolean; error?: string }> {
  const senderId: string = cfg.senderId || "HIRESM";
  const authkey: string = sec.apiKey || "";
  if (!authkey) return { ok: false, error: "MSG91 apiKey missing" };
  const to = String(phone).replace(/\D/g, "");
  try {
    const res = await fetch("https://api.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "content-type": "application/json", authkey },
      body: JSON.stringify({
        flow_id: cfg.flowId || undefined,
        sender: senderId,
        mobiles: to,
        msg: message,
      }),
    });
    if (!res.ok) return { ok: false, error: `MSG91 HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function sendViaTwilio(phone: string, message: string, cfg: any, sec: any): Promise<{ ok: boolean; error?: string }> {
  // Twilio-native key names (accountSid / from / authToken) with a legacy
  // fallback to the old generic names so pre-migration saved configs keep
  // working until they're re-entered. `.trim()` on every read because a
  // browser copy-paste from the Twilio Console often captures trailing
  // whitespace / newlines that Twilio's auth check rejects silently.
  const sid = String(cfg.accountSid || "").trim();
  const from = String(cfg.from || cfg.senderId || "").trim();
  const token = String(sec.authToken || sec.apiSecret || sec.apiKey || "").trim();
  // Report each missing field separately so the admin knows exactly what to
  // paste — the previous combined message wasn't actionable.
  const missing: string[] = [];
  if (!sid) missing.push("Account SID");
  if (!token) missing.push("Auth Token");
  if (!from) missing.push("From number");
  if (missing.length) return { ok: false, error: `Twilio: ${missing.join(" / ")} missing` };
  // Cheap structural check — Account SID always starts with AC + 32 hex.
  // Catches pasting the wrong field (e.g. the API Key SID which starts with SK).
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) {
    return { ok: false, error: "Twilio: Account SID must start with 'AC' followed by 32 hex characters. The value pasted doesn't match — double-check you copied from the 'Account SID' row on the Twilio Console (not the API Key SID)." };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const endpoint = String(cfg.endpoint || "").trim() || `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${auth}` },
      body: new URLSearchParams({ From: from, To: phone, Body: message }).toString(),
    });
    if (!res.ok) {
      // Surface Twilio's own error message so "From number not verified" /
      // "trial account can only send to verified numbers" / etc. reach the
      // admin verbatim instead of a bare HTTP code. 401 has a well-known
      // cause (Auth Token doesn't match this Account SID) — spell it out.
      let detail = "";
      try { const j = await res.json(); detail = j.message || j.detail || ""; } catch {}
      if (res.status === 401) {
        return { ok: false, error: "Twilio 401: Auth Token doesn't match this Account SID. Re-copy the Auth Token from the Twilio Console (click 'Show' to reveal it in full) and paste — no trailing spaces. If it still fails, confirm both values come from the SAME Twilio project." };
      }
      return { ok: false, error: detail ? `Twilio ${res.status}: ${detail}` : `Twilio HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function sendViaGupshup(phone: string, message: string, cfg: any, sec: any): Promise<{ ok: boolean; error?: string }> {
  const userid: string = cfg.userId || "";
  const password: string = sec.apiSecret || "";
  const from: string = cfg.senderId || "HIRESM";
  if (!userid || !password) return { ok: false, error: "Gupshup userId / apiSecret missing" };
  try {
    const url = `https://enterprise.smsgupshup.com/GatewayAPI/rest?method=sendMessage&userid=${encodeURIComponent(userid)}&password=${encodeURIComponent(password)}&send_to=${encodeURIComponent(phone)}&msg=${encodeURIComponent(message)}&msg_type=TEXT&auth_scheme=plain&v=1.1&format=text&mask=${encodeURIComponent(from)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Gupshup HTTP ${res.status}` };
    const body = await res.text();
    if (body.toLowerCase().startsWith("error")) return { ok: false, error: body };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const res = await sendSmsDetailed(phone, message);
  return res.ok;
}

// Same as sendSms but returns the reason when it fails — used by the admin
// test-connection button so operators can see what's actually wrong.
export async function sendSmsDetailed(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const p = await getProviderConfig("sms");
  if (!p?.enabled) {
    logger.info(`[SMS-DEV] To: ${phone} | Message: ${message}`);
    return { ok: true };
  }
  switch (p.providerType) {
    case "msg91":   return sendViaMsg91(phone, message, p.config, p.secrets);
    case "twilio":  return sendViaTwilio(phone, message, p.config, p.secrets);
    case "gupshup": return sendViaGupshup(phone, message, p.config, p.secrets);
    case "nic":
      logger.warn("NIC SMS gateway not yet implemented; logging instead");
      logger.info(`[SMS] To: ${phone} | Message: ${message}`);
      return { ok: true };
    case "mock":
    default:
      logger.info(`[SMS-MOCK] To: ${phone} | Message: ${message}`);
      return { ok: true };
  }
}

export async function sendOtpSms(phone: string, otp: string): Promise<boolean> {
  return sendSms(phone, `Your HireStream verification code is: ${otp}. Valid for 5 minutes.`);
}

// Test-connection helper for admin Integrations panel. Sends a one-off test
// SMS to the number provided. We do not require a sink here because providers
// validate credentials inline on send.
export async function testSmsConnection(testPhone: string): Promise<{ ok: boolean; error?: string }> {
  if (!testPhone) return { ok: false, error: "A test phone number is required." };
  return sendSmsDetailed(testPhone, "HireStream SMS gateway test — if you received this, your config works.");
}
