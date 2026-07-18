/**
 * Registration field configuration — read by the form, written by HPSEDC.
 *
 * GET  /api/v1/registration-fields         public  — the form needs it before login
 * GET  /api/v1/admin/registration-fields   admin   — includes the locked flags
 * PUT  /api/v1/admin/registration-fields/:key
 *
 * Same contract as the profession catalogue: HPSEDC change eligibility and form
 * shape without a release, and the server is the authority — a field turned off
 * here is not merely hidden, it stops being required.
 */
import { Router } from "express";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { registrationFields, upsertRegistrationFieldSchema } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

/** Public read — the registration form is reachable before a session exists. */
export const publicRouter = Router();

publicRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await storage.db.select().from(registrationFields).orderBy(asc(registrationFields.displayOrder));
    // A compact map is what the form actually consumes; the admin screen gets
    // the full rows from its own endpoint.
    const config: Record<string, { enabled: boolean; required: boolean }> = {};
    for (const r of rows as any[]) config[r.fieldKey] = { enabled: r.enabled, required: r.required };
    res.json({ success: true, data: { fields: config } });
  } catch (error) { next(error); }
});

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const user = req.user as any;
  if (!user) return res.status(401).json({ success: false, error: { code: 401, message: "Authentication required" } });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return res.status(403).json({ success: false, error: { code: 403, message: "Admin access required" } });
  }
  next();
});

adminRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await storage.db.select().from(registrationFields)
      .orderBy(asc(registrationFields.page), asc(registrationFields.displayOrder));
    res.json({ success: true, data: { fields: rows } });
  } catch (error) { next(error); }
});

adminRouter.put("/:key", async (req, res, next) => {
  try {
    const key = req.params.key;
    const parsed = upsertRegistrationFieldSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 400, message: parsed.error.issues[0]?.message ?? "Invalid input" } });
    }
    const [row] = await storage.db.select().from(registrationFields).where(eq(registrationFields.fieldKey, key)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: { code: 404, message: "Field not found" } });

    // The locks are the guard rail that stops an admin breaking the portal from
    // a settings screen. Enforced HERE, not just greyed out in the UI — a
    // hand-crafted PUT must not be able to hide a field the form depends on.
    const next$: any = {};
    if (typeof parsed.data.enabled === "boolean") {
      if (row.lockedEnabled && parsed.data.enabled === false) {
        return res.status(400).json({ success: false, error: { code: 400, message: `"${row.labelEn}" cannot be turned off — the portal depends on it.` } });
      }
      next$.enabled = parsed.data.enabled;
    }
    if (typeof parsed.data.required === "boolean") {
      if (row.lockedRequired && parsed.data.required !== row.required) {
        return res.status(400).json({ success: false, error: { code: 400, message: `"${row.labelEn}" cannot change from ${row.required ? "required" : "optional"}.` } });
      }
      next$.required = parsed.data.required;
    }
    // A field that is off cannot also be required — the candidate would be
    // blocked by something they are never shown.
    const enabled = next$.enabled ?? row.enabled;
    if (!enabled) next$.required = false;

    const [updated] = await storage.db.update(registrationFields)
      .set({ ...next$, updatedAt: new Date() })
      .where(eq(registrationFields.fieldKey, key)).returning();
    logger.info(`Registration fields: admin set ${key} -> ${JSON.stringify(next$)}`);
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
});
