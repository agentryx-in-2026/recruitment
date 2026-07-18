/**
 * Admin CRUD for professions — UAT-05 item 21's headline requirement.
 *
 * HPSEDC, 16-07-2026:
 *   "Recommendation: The list of mandatory qualifications and documents should be
 *    configurable by the administrator, enabling HPSEDC to add, modify, or update
 *    profession-specific eligibility criteria WITHOUT requiring changes to the
 *    application."
 *
 * Until this existed, item 21 was BUILT but not MET: the engine read the table,
 * but the only way to change a row was to ask us to run SQL — i.e. exactly the
 * "changes to the application" the requirement exists to avoid.
 *
 * ── What is editable, and what is not ───────────────────────────────────────
 * Editable: label(+hi), jobCategoryKeys, displayOrder, qualifications,
 * skillsEnabled, skillsOptions, requiredDocs, optionalDocs, candidateNote(+hi),
 * active. That is the DATA — HPSEDC's eligibility policy, which is theirs.
 *
 * NOT editable: `professionKey` after creation (it is the stable identity —
 * candidate_professions rows point at it, and renaming it would orphan every
 * candidate who picked that trade), and `hasAddonBlock` (it selects a
 * CODE-DEFINED form shape in client/src/pages/register/profession-blocks.tsx;
 * turning it on for a profession with no block is a silent no-op). Making field
 * SHAPES admin-authorable means a form builder, which is the rule engine this
 * design deliberately is not.
 */

import { Router } from "express";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { professionRequirements, candidateProfessions, upsertProfessionRequirementSchema } from "@shared/schema";
import { DOC_TYPES, DOC_TYPE_KEYS } from "@shared/documents";
import { eq, asc, count } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.use((req, res, next) => {
  const user = req.user as any;
  if (!user) return res.status(401).json({ success: false, error: { code: 401, message: "Authentication required" } });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return res.status(403).json({ success: false, error: { code: 403, message: "Admin access required" } });
  }
  next();
});

/**
 * GET /api/v1/admin/professions
 *
 * Every row including inactive ones (the candidate-facing catalogue shows only
 * active), plus the document vocabulary to populate the pickers, plus a live
 * count of candidates per trade — because "how many people does this affect?" is
 * the first thing you want to know before tightening a requirement.
 */
router.get("/", async (_req, res, next) => {
  try {
    const db = storage.db;
    const rows = await db.select().from(professionRequirements).orderBy(asc(professionRequirements.displayOrder));
    const counts = await db
      .select({ key: candidateProfessions.professionKey, c: count() })
      .from(candidateProfessions)
      .groupBy(candidateProfessions.professionKey);
    const byKey: Record<string, number> = Object.fromEntries(counts.map((r: any) => [r.key, Number(r.c)]));
    res.json({
      success: true,
      data: {
        professions: rows.map((r: any) => ({ ...r, candidateCount: byKey[r.professionKey] ?? 0 })),
        // The pickers must offer the SAME vocabulary the resolver enforces —
        // a free-text doc key here would be silently unenforceable and would
        // 400 on upload.
        docTypes: DOC_TYPES.map((d) => ({ key: d.key, label: d.label, stage: d.stage })),
      },
    });
  } catch (error) { next(error); }
});

/** POST /api/v1/admin/professions — add a trade HPSEDC recruit for. */
router.post("/", async (req, res, next) => {
  try {
    const db = storage.db;
    const parsed = upsertProfessionRequirementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.flatten() } });
    }
    const body = parsed.data;
    if (!body.professionKey || !body.label) {
      return res.status(400).json({ success: false, error: { code: 400, message: "A key and a label are required." } });
    }
    const badDocs = [...(body.requiredDocs || []), ...(body.optionalDocs || [])].filter((d) => !DOC_TYPE_KEYS.includes(d));
    if (badDocs.length) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Unknown document type: ${badDocs.join(", ")}` } });
    }
    const clash = await db.select({ k: professionRequirements.professionKey }).from(professionRequirements)
      .where(eq(professionRequirements.professionKey, body.professionKey)).limit(1);
    if (clash.length) {
      return res.status(409).json({ success: false, error: { code: 409, message: `A profession with the key "${body.professionKey}" already exists.` } });
    }
    // hasAddonBlock is never set from a request — see the file header.
    const [row] = await db.insert(professionRequirements).values({ ...body, hasAddonBlock: false } as any).returning();
    logger.info(`Professions: admin created "${body.professionKey}"`);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

/** PUT /api/v1/admin/professions/:key — edit HPSEDC's eligibility policy. */
router.put("/:key", async (req, res, next) => {
  try {
    const db = storage.db;
    const key = req.params.key;
    const parsed = upsertProfessionRequirementSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.flatten() } });
    }
    const body: any = { ...parsed.data };
    const badDocs = [...(body.requiredDocs || []), ...(body.optionalDocs || [])].filter((d: string) => !DOC_TYPE_KEYS.includes(d));
    if (badDocs.length) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Unknown document type: ${badDocs.join(", ")}` } });
    }
    // The key is identity: candidate_professions rows point at it, so renaming
    // would orphan every candidate holding that trade. hasAddonBlock is code.
    delete body.professionKey;
    delete body.hasAddonBlock;

    const existing = await db.select().from(professionRequirements).where(eq(professionRequirements.professionKey, key)).limit(1);
    if (!existing.length) return res.status(404).json({ success: false, error: { code: 404, message: "Profession not found" } });

    const [row] = await db.update(professionRequirements)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(professionRequirements.professionKey, key))
      .returning();
    logger.info(`Professions: admin updated "${key}" (${Object.keys(body).join(", ")})`);
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
});

/**
 * DELETE /api/v1/admin/professions/:key — deactivate, never delete.
 *
 * A hard delete would break every candidate_professions row pointing at the key
 * (and the FK does not cascade from this side). Deactivating removes it from the
 * picker while leaving existing candidates' trades intact and their documents
 * still resolvable. If HPSEDC genuinely want it gone, they can reactivate and
 * ask — a portal should not make "20,000 rows lose their trade" a one-click act.
 */
router.delete("/:key", async (req, res, next) => {
  try {
    const db = storage.db;
    const key = req.params.key;
    const [held] = await db.select({ c: count() }).from(candidateProfessions).where(eq(candidateProfessions.professionKey, key));
    const [row] = await db.update(professionRequirements)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(professionRequirements.professionKey, key))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: { code: 404, message: "Profession not found" } });
    logger.info(`Professions: admin deactivated "${key}" (${held?.c ?? 0} candidates hold it)`);
    res.json({ success: true, data: { ...row, candidateCount: Number(held?.c ?? 0) } });
  } catch (error) { next(error); }
});

export default router;
