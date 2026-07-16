import { Router } from "express";
import { TOTP, generateSecret as otpGenerateSecret } from "otplib";

const totp = new TOTP();

// Adapter to keep our call sites readable (mirrors otplib v12 authenticator API)
const authenticator = {
  generateSecret: () => otpGenerateSecret(),
  keyuri: (account: string, issuer: string, secret: string) =>
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
  verify: async ({ token, secret }: { token: string; secret: string }): Promise<boolean> => {
    if (!token || !secret) return false;
    try {
      const result: any = await totp.verify(token, { secret });
      return !!result?.valid || !!result; // handle both boolean and {valid} return
    } catch {
      return false;
    }
  },
};
import qrcode from "qrcode";
import crypto from "crypto";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-")
  );
}

// POST /api/v1/2fa/setup — generate secret + QR code (does not enable yet)
router.post("/setup", protect, async (req, res) => {
  try {
    const user = req.user as any;
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: "2FA is already enabled" });
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, "HireStream", secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Store secret temporarily (not enabled until verified)
    await storage.db.update(users)
      .set({ twoFactorSecret: secret })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      data: {
        secret,
        qr_code: qrDataUrl,
        manual_entry_key: secret,
        issuer: "HireStream",
        account: user.email,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/2fa/verify-and-enable — verify code + activate 2FA + return recovery codes
router.post("/verify-and-enable", protect, async (req, res) => {
  try {
    const user = req.user as any;
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "token required" });
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    // Re-fetch user to get the secret
    const [u] = await storage.db.select().from(users).where(eq(users.id, user.id));
    if (!u?.twoFactorSecret) {
      return res.status(400).json({ success: false, message: "Run /setup first" });
    }

    const valid = await authenticator.verify({ token, secret: u.twoFactorSecret });
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    const recoveryCodes = generateRecoveryCodes();

    await storage.db.update(users)
      .set({
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: recoveryCodes,
      })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      message: "2FA enabled. Save these recovery codes — they can be used if you lose access to your authenticator.",
      data: { recovery_codes: recoveryCodes },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/2fa/disable — disable 2FA (requires current TOTP code)
router.post("/disable", protect, async (req, res) => {
  try {
    const user = req.user as any;
    const { token } = req.body;
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const [u] = await storage.db.select().from(users).where(eq(users.id, user.id));
    if (!u?.twoFactorEnabled || !u?.twoFactorSecret) {
      return res.status(400).json({ success: false, message: "2FA is not enabled" });
    }

    const valid = await authenticator.verify({ token: token || "", secret: u.twoFactorSecret });
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid code — required to disable 2FA" });
    }

    await storage.db.update(users)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      })
      .where(eq(users.id, user.id));

    res.json({ success: true, message: "2FA disabled" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/2fa/status — check if 2FA is enabled for current user
router.get("/status", protect, async (req, res) => {
  try {
    const user = req.user as any;
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });
    const [u] = await storage.db.select().from(users).where(eq(users.id, user.id));
    res.json({
      success: true,
      data: {
        enabled: !!u?.twoFactorEnabled,
        recovery_codes_remaining: u?.twoFactorRecoveryCodes?.length || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/2fa/verify-login — verify TOTP during login flow
// Used by clients who have an active session but need to complete 2FA challenge
router.post("/verify-login", protect, async (req, res) => {
  try {
    const user = req.user as any;
    const { token } = req.body;
    if (!storage.db) return res.status(500).json({ success: false, message: "No db available" });

    const [u] = await storage.db.select().from(users).where(eq(users.id, user.id));
    if (!u?.twoFactorEnabled || !u?.twoFactorSecret) {
      return res.json({ success: true, data: { skipped: true } });
    }

    // Check if it's a recovery code
    if (token && u.twoFactorRecoveryCodes?.includes(token.toUpperCase())) {
      // Burn the code
      const remaining = u.twoFactorRecoveryCodes.filter((c: string) => c !== token.toUpperCase());
      await storage.db.update(users)
        .set({ twoFactorRecoveryCodes: remaining })
        .where(eq(users.id, user.id));
      (req.session as any).twoFactorVerified = true;
      return res.json({ success: true, data: { method: "recovery_code", remaining: remaining.length } });
    }

    const valid = await authenticator.verify({ token: token || "", secret: u.twoFactorSecret });
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    (req.session as any).twoFactorVerified = true;
    res.json({ success: true, data: { method: "totp" } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
