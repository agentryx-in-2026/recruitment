/**
 * Professions — UAT-05 Items 14, 15, 21.
 *
 * Public read of the profession catalogue (the picker on page 2 and the add-on
 * blocks on page 3), plus the candidate's own selections.
 *
 * The catalogue is PUBLIC and unauthenticated on purpose: page 2 is the first
 * real screen of registration and the tiles must render before we know who the
 * candidate is. It carries no personal data — it is HPSEDC's published
 * eligibility policy, which is exactly the thing a prospective applicant should
 * be able to read before deciding to apply.
 */

import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import {
  professionRequirements, candidateProfessions, candidates,
  insertCandidateProfessionSchema,
} from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { getSetting } from "../services/settings.service";

const router = Router();

async function getCandidateIdFromUser(userId: string): Promise<string | null> {
  const db = storage.db;
  if (!db) return null;
  const rows = await db.select().from(candidates).where(eq(candidates.userId, userId)).limit(1);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * GET /api/v1/professions — the catalogue.
 *
 * Active rows only, in display order. This is the single source for the picker
 * tiles, the qualification dropdowns, the specific-skills chips and the
 * candidate notes; the client holds no hardcoded profession list, which is what
 * makes HPSEDC's admin edits take effect without a release (Item 21).
 */
router.get("/", async (_req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const rows = await db.select()
      .from(professionRequirements)
      .where(eq(professionRequirements.active, true))
      .orderBy(asc(professionRequirements.displayOrder));

    const maxProfessions: number = await getSetting("registration.max_professions");

    res.json({ success: true, data: { professions: rows, maxProfessions } });
  } catch (error) {
    next(error);
  }
});

/** GET /api/v1/professions/mine — this candidate's selected trades. */
router.get("/mine", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const candidateId = await getCandidateIdFromUser((req.user as any).id);
    // No candidate row yet is a normal state mid-registration, not an error.
    if (!candidateId) return res.json({ success: true, data: [] });

    const rows = await db.select()
      .from(candidateProfessions)
      .where(eq(candidateProfessions.candidateId, candidateId));

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/professions/mine — replace the whole set.
 *
 * Whole-set replace rather than per-row CRUD: the client is a
 * pick-up-to-three-tiles screen, so "here is what I do" is one intent and one
 * request. Per-row POST/DELETE would make deselecting a tile a separate call
 * and leave the set half-written if the second one failed.
 */
const putSchema = z.object({
  professions: z.array(insertCandidateProfessionSchema).max(10),
});

router.put("/mine", protect, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "Invalid professions payload", details: parsed.error.flatten() },
      });
    }
    const incoming = parsed.data.professions;

    const candidateId = await getCandidateIdFromUser((req.user as any).id);
    if (!candidateId) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Complete your details before saving your trades." } });
    }

    // Cap (Item 15). Configurable — HPSEDC tune it without a release.
    const maxProfessions: number = await getSetting("registration.max_professions");
    if (incoming.length > maxProfessions) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `Pick up to ${maxProfessions} trades.` },
      });
    }

    // Every key must exist and be active. Without this a hand-crafted PUT could
    // write a profession that no add-on block, document rule or job category
    // knows about — an unmatchable row that looks fine in the UI.
    const known = await db.select({
      key: professionRequirements.professionKey,
      active: professionRequirements.active,
    }).from(professionRequirements);
    const activeKeys = new Set(known.filter((k: { active: boolean }) => k.active).map((k: { key: string }) => k.key));

    const bad = incoming.filter((p) => !activeKeys.has(p.professionKey));
    if (bad.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `Unknown trade: ${bad.map((b) => b.professionKey).join(", ")}` },
      });
    }

    // The unique index already rejects duplicates, but a 500 from a constraint
    // violation is a worse answer than a 400 that says what is wrong.
    const seen = new Set<string>();
    const dupe = incoming.find((p) => { if (seen.has(p.professionKey)) return true; seen.add(p.professionKey); return false; });
    if (dupe) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `You have picked ${dupe.professionKey} twice.` },
      });
    }

    // otherLabel is only meaningful on the "other" escape hatch. Silently
    // dropping it elsewhere would let a client label a "nurse" row "Astronaut".
    const strayLabel = incoming.find((p) => p.otherLabel && p.professionKey !== "other");
    if (strayLabel) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "A custom label is only allowed on the 'Other' trade." },
      });
    }
    const otherMissingLabel = incoming.find((p) => p.professionKey === "other" && !p.otherLabel?.trim());
    if (otherMissingLabel) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: "Tell us what work you do." },
      });
    }

    // Replace-in-transaction: a delete that commits without its insert would
    // wipe the candidate's trades on a failed save.
    await db.transaction(async (tx: any) => {
      await tx.delete(candidateProfessions).where(eq(candidateProfessions.candidateId, candidateId));
      if (incoming.length > 0) {
        await tx.insert(candidateProfessions).values(
          incoming.map((p) => ({
            candidateId,
            professionKey: p.professionKey,
            otherLabel: p.otherLabel ?? null,
            experienceMonths: p.experienceMonths ?? 0,
            specificSkills: p.specificSkills ?? [],
            lastEmployerName: p.lastEmployerName ?? null,
            lastEmployerCountry: p.lastEmployerCountry ?? null,
            addonData: p.addonData ?? null,
          })),
        );
      }
    });

    const rows = await db.select()
      .from(candidateProfessions)
      .where(eq(candidateProfessions.candidateId, candidateId));

    logger.info(`Professions saved for candidate ${candidateId}: ${incoming.map((p) => p.professionKey).join(", ") || "(none)"}`);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
