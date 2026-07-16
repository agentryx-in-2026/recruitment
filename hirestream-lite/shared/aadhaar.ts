/**
 * Aadhaar helpers — shared by client and server so formatting, masking and
 * validation are identical everywhere.
 *
 * HPSEDC requirements (2026-07-07):
 *   1. Format for readability: "XXXX XXXX XXXX" (a space every 4 digits).
 *   2. Mask after submission / in view mode: "XXXX XXXX 1234" (first 8 hidden).
 *   3. Validate with the Verhoeff checksum in addition to "exactly 12 digits".
 *
 * The stored value is always the raw 12 digits; spaces are display-only.
 */

/** Strip to digits only, capped at 12. */
export function stripAadhaar(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

/** Group raw digits as "1234 5678 9012" (space every 4). Display only. */
export function formatAadhaar(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Mask to the last 4 digits: "XXXX XXXX 1234". Returns null for empty input.
 * Accepts a raw or already-formatted value.
 */
export function maskAadhaar(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}

// ── Verhoeff checksum (the algorithm UIDAI uses for the 12th digit) ──────
// Dihedral group D5 multiplication table.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
// Permutation table.
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff-validate a numeric string whose LAST digit is the check digit. */
export function verhoeffValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = D[c][P[i % 8][digits[i]]];
  }
  return c === 0;
}

/** A valid Aadhaar = exactly 12 digits, first digit not 0/1, Verhoeff-valid. */
export function isValidAadhaar(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{12}$/.test(digits)) return false;
  if (digits[0] === "0" || digits[0] === "1") return false; // UIDAI: never starts 0/1
  return verhoeffValid(digits);
}
