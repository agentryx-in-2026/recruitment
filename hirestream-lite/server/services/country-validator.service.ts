/**
 * Country validator — single source of truth for valid destination countries.
 *
 * Loads `country_info.name` rows once at startup (and on demand whenever the
 * admin updates the country list via PUT /api/v1/content/countries/:code).
 * Job create/update handlers validate against this cache instead of allowing
 * free-text country values.
 *
 * Why a cache (not a per-request query):
 *   - The country_info table is ~15-20 rows. A SELECT per job-create would
 *     work but is unnecessary overhead.
 *   - Validation needs to be synchronous in places (Zod refines, etc.) — an
 *     in-memory Set makes that trivial.
 *   - Cache invalidation is explicit (called from the admin update route).
 *
 * For an OVERSEAS placement portal: India is special-cased with a clearer
 * error message because it's the most likely typo / scope mistake.
 */

import { storage } from "../storage";
import { countryInfo } from "@shared/schema";
import { logger } from "../config/logger.config";
import { eq } from "drizzle-orm";

const _names = new Set<string>();
let _loaded = false;

/**
 * Load only ACTIVE country names. Disabled countries (is_active=false) are
 * excluded so the validator + job-create dropdown stay in sync — disabling
 * a country in the admin UI immediately blocks new postings to it.
 * Historical jobs referencing a now-disabled country remain valid; only
 * NEW create/update with that country is rejected.
 */
export async function loadValidCountries(): Promise<void> {
  if (!storage.db) {
    logger.warn("country-validator: skip load — no DB");
    return;
  }
  const rows = await storage.db
    .select({ name: countryInfo.name })
    .from(countryInfo)
    .where(eq(countryInfo.isActive, true));
  _names.clear();
  for (const r of rows) {
    if (r.name) _names.add(String(r.name));
  }
  _loaded = true;
  logger.info(`country-validator: loaded ${_names.size} active destination countries`);
}

export function isValidCountry(name: string | null | undefined): boolean {
  if (!name) return false;
  return _names.has(name.trim());
}

export function isLoaded(): boolean {
  return _loaded;
}

export function listValidCountries(): string[] {
  return Array.from(_names).sort();
}

/**
 * India check — case-insensitive, trims surrounding whitespace. Used to
 * surface a clearer error when someone tries to post an India job on the
 * overseas portal (most common scope mistake / typo).
 */
export function isIndia(name: string | null | undefined): boolean {
  if (!name) return false;
  return /^\s*india\s*$/i.test(name);
}

export type CountryValidationResult =
  | { ok: true }
  | { ok: false; code: "INDIA_NOT_VALID_DESTINATION"; message: string }
  | { ok: false; code: "UNKNOWN_COUNTRY"; message: string };

/**
 * Validate a country string. Empty/null is ALLOWED (drafts can be incomplete);
 * the route handler should additionally require non-empty country at publish
 * time (status=active). When non-empty: India is rejected with a scoped
 * message; anything else must be in the admin-curated country_info list.
 */
export function validateCountry(name: string | null | undefined): CountryValidationResult {
  if (!name || !name.trim()) return { ok: true };           // drafts can be incomplete
  if (isIndia(name)) {
    return {
      ok: false,
      code: "INDIA_NOT_VALID_DESTINATION",
      message: "HireStream is the overseas placement portal — destination country must be outside India. For domestic recruitment please use a different platform.",
    };
  }
  if (!isValidCountry(name)) {
    const valid = listValidCountries();
    return {
      ok: false,
      code: "UNKNOWN_COUNTRY",
      message: `Unknown destination country "${name.trim()}". Configured destinations: ${valid.join(", ")}. Admin can add new destinations in the Countries tab.`,
    };
  }
  return { ok: true };
}
