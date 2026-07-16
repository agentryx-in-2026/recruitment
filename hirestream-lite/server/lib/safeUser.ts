/**
 * security 2026-07-07 (A02-2/A02-3): single safe-user serializer.
 *
 * Several routes serialised `users` rows with only `password` stripped, which
 * leaked the TOTP seed (`twoFactorSecret`), the 2FA recovery codes, and the
 * raw Aadhaar number (DPDP) — in the admin users.csv export, the superadmin
 * user list/lookup, and even the login/`/me` responses (self-leak, but an XSS
 * or shoulder-surf away from defeating 2FA).
 *
 * Rule: NO response may ever emit `password`, `twoFactorSecret`, or
 * `twoFactorRecoveryCodes`; `aadhaarNumber` is masked to its last 4 digits.
 * Use `sanitizeUser()` on every users-row serialisation instead of the old
 * `const { password, ...rest } = user` pattern.
 */

// Aadhaar masking lives in @shared/aadhaar ("XXXX XXXX 1234", per HPSEDC).
// Re-exported here so existing server imports (`../lib/safeUser`) keep working.
export { maskAadhaar } from "@shared/aadhaar";
import { maskAadhaar } from "@shared/aadhaar";

/** Strip credential/2FA secrets and mask Aadhaar on a users row. */
export function sanitizeUser<T extends Record<string, any>>(user: T): Omit<T, "password" | "twoFactorSecret" | "twoFactorRecoveryCodes"> {
  const { password: _pw, twoFactorSecret: _tfs, twoFactorRecoveryCodes: _tfr, ...rest } = user as Record<string, any>;
  if ("aadhaarNumber" in rest) rest.aadhaarNumber = maskAadhaar(rest.aadhaarNumber);
  return rest as Omit<T, "password" | "twoFactorSecret" | "twoFactorRecoveryCodes">;
}
