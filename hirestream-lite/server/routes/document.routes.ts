import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { storage } from "../storage";
import { protect } from "../middleware/auth.middleware";
import { upload, UPLOAD_DIR, HS_DOCS_DIR, verifyUploadedFile, handleUploadErrors } from "../middleware/upload.middleware";
import { documents, candidates, applications, jobs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../config/logger.config";

const router = Router();

// All document routes require authentication
router.use(protect);

// ── Upload Document ─────────────────────────────────────────────────
router.post("/", upload.single("file"), verifyUploadedFile, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (user.role !== "candidate") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only candidates can upload documents" } });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No file uploaded" } });
    }

    // Find candidate record
    const candidateRows = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
    if (candidateRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Candidate profile not found. Complete your profile first." } });
    }

    const docType = req.body.type || "cv";
    // v0.4.31 (HPSEDC Item 7): expanded vocabulary so each doc class has
    // its own slot + ✓ indicator in the wizard. Legacy "certificate" still
    // accepted for backward-compat with existing data.
    const validTypes = [
      "cv",
      "passport",
      "identity_proof",
      "educational_certificate",
      "experience_certificate",
      "offer_letter",
      "certificate", // legacy, kept for backward-compat
      "other",
    ];
    if (!validTypes.includes(docType)) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Invalid document type. Must be one of: ${validTypes.join(", ")}` } });
    }

    // Store under the HS namespace so candidate docs can never be confused with
    // any other app's uploads. URL is internal-only — downloads route through
    // the auth-gated /api/v1/candidates/documents/:id/download handler below.
    const result = await db.insert(documents).values({
      candidateId: candidateRows[0].id,
      type: docType,
      fileName: req.file.originalname,
      fileUrl: `/uploads/hs/candidates/docs/${req.file.filename}`,
      fileSize: req.file.size,
    }).returning();

    logger.info(`Document uploaded: ${result[0].id} by candidate ${candidateRows[0].id}`);
    res.status(201).json({ success: true, data: result[0] });
  } catch (error) {
    next(error);
  }
});

// ── List Documents ──────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;

    // Find candidate record
    const candidateRows = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
    if (candidateRows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.candidateId, candidateRows[0].id))
      .orderBy(documents.uploadedAt);

    res.json({ success: true, data: docs });
  } catch (error) {
    next(error);
  }
});

// ── Download Document ───────────────────────────────────────────────
router.get("/:id/download", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;

    const docRows = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1);
    if (docRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Document not found" } });
    }

    const doc = docRows[0];

    // Authorization: candidates own docs only; agents/employers only for candidates who applied to their jobs
    if (user.role === "candidate") {
      const candidateRows = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
      if (candidateRows.length === 0 || candidateRows[0].id !== doc.candidateId) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to access this document" } });
      }
    } else if (user.role === "agent" || user.role === "employer") {
      const relatedApps = await db
        .select({ id: applications.id })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(and(
          eq(applications.candidateId, doc.candidateId!),
          user.role === "agent" ? eq(jobs.agentId, user.id) : eq(jobs.employerId, user.id)
        ))
        .limit(1);
      if (relatedApps.length === 0) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to access this document" } });
      }
    }

    // Resolve relative to the stored URL rather than a fixed base so both the
    // new namespaced layout (/uploads/hs/candidates/docs/<file>) and legacy
    // bare-root URLs (pre-namespacing) continue to resolve after the migration.
    // path.basename is kept for the legacy branch as a safety net so a malformed
    // URL can't escape UPLOAD_DIR via traversal.
    const rel = doc.fileUrl!.replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_DOCS_DIR, path.basename(rel));

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, error: { code: 404, message: "File not found on disk" } });
    }

    // ?inline=1 → preview in the browser (PDF/image viewer) instead of downloading.
    if (req.query.inline === "1" || req.query.preview === "1") {
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
      return res.sendFile(path.resolve(filePath));
    }
    res.download(filePath, doc.fileName);
  } catch (error) {
    next(error);
  }
});

// ── Verify / Un-verify Document ─────────────────────────────────────
// audit 2026-07-06 (Batch 4B): documents.verified/verifiedBy existed in the
// schema but nothing ever wrote them. Staff (agent who owns the candidate,
// or admin/superadmin) mark a doc verified after eyeballing it — the ✓ then
// shows on the agent candidate-detail + admin views (which spread the row).
router.patch("/:id/verify", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;
    if (!["agent", "admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ success: false, error: { code: 403, message: "Only HPSEDC staff can verify documents" } });
    }
    if (typeof req.body?.verified !== "boolean") {
      return res.status(400).json({ success: false, error: { code: 400, message: "Body must include { verified: boolean }" } });
    }
    const verified: boolean = req.body.verified;

    const docRows = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1);
    if (docRows.length === 0 || !docRows[0].candidateId) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Document not found" } });
    }
    const doc = docRows[0];

    // Agents may only verify docs of candidates on their own jobs.
    const { userOwnsCandidate } = await import("../lib/ownership");
    if (!(await userOwnsCandidate(db, user, doc.candidateId!))) {
      return res.status(403).json({ success: false, error: { code: 403, message: "You can only verify documents of your own candidates" } });
    }

    const [updated] = await db.update(documents)
      .set(verified
        ? { verified: true, verifiedBy: user.id, verifiedAt: new Date() }
        : { verified: false, verifiedBy: null, verifiedAt: null })
      .where(eq(documents.id, doc.id))
      .returning();

    // Tell the candidate their document was checked (verify only — silently
    // clearing a ✓ is a staff-side correction, not a candidate event).
    if (verified) {
      const candRows = await db.select().from(candidates).where(eq(candidates.id, doc.candidateId!)).limit(1);
      if (candRows.length && candRows[0].userId) {
        const { notify } = await import("../services/notification.service");
        notify({
          userId: candRows[0].userId,
          type: "system",
          title: "Document verified",
          message: `Your ${doc.type.replace(/_/g, " ")} document "${doc.fileName}" has been verified by HPSEDC.`,
          // audit 2026-07-06 (Batch 4B-2): bilingual — citizen-facing.
          titleHi: "दस्तावेज़ सत्यापित हुआ",
          messageHi: `आपका ${doc.type.replace(/_/g, " ")} दस्तावेज़ "${doc.fileName}" HPSEDC द्वारा सत्यापित कर दिया गया है।`,
          severity: "positive",
          metadata: { documentId: doc.id },
        }).catch(() => {});
      }
    }

    logger.info(`Document ${doc.id} ${verified ? "verified" : "un-verified"} by ${user.role} ${user.id}`);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// ── Delete Document ─────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const user = req.user as any;

    const docRows = await db.select().from(documents).where(eq(documents.id, req.params.id)).limit(1);
    if (docRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 404, message: "Document not found" } });
    }

    const doc = docRows[0];

    // Only the owning candidate can delete their docs
    if (user.role === "candidate") {
      const candidateRows = await db.select().from(candidates).where(eq(candidates.userId, user.id)).limit(1);
      if (candidateRows.length === 0 || candidateRows[0].id !== doc.candidateId) {
        return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized to delete this document" } });
      }
    } else if (user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({ success: false, error: { code: 403, message: "Not authorized" } });
    }

    // Delete file from disk
    // Resolve relative to the stored URL rather than a fixed base so both the
    // new namespaced layout (/uploads/hs/candidates/docs/<file>) and legacy
    // bare-root URLs (pre-namespacing) continue to resolve after the migration.
    // path.basename is kept for the legacy branch as a safety net so a malformed
    // URL can't escape UPLOAD_DIR via traversal.
    const rel = doc.fileUrl!.replace(/^\/uploads\//, "");
    const filePath = rel.startsWith("hs/")
      ? path.join(UPLOAD_DIR, rel)
      : path.join(HS_DOCS_DIR, path.basename(rel));
    try {
      await fs.unlink(filePath);
    } catch {
      // File might already be deleted — that's fine
      logger.warn(`File not found on disk during delete: ${filePath}`);
    }

    // Delete from DB
    await db.delete(documents).where(eq(documents.id, doc.id));

    logger.info(`Document deleted: ${doc.id}`);
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    next(error);
  }
});

// Catch multer-specific errors (LIMIT_FILE_SIZE → 413; file-filter type
// rejection → 400) before they hit the global handler as 500s. Registered
// last so it sees errors from every upload route in this router.
router.use(handleUploadErrors);

export default router;
