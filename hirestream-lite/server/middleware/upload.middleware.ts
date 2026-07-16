import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.config";

// Upload root. Subdirs are the namespace — nothing ever lands in the bare root
// so we can't collide with another app's files even if a future misconfig shares
// a parent directory. Every writer (document upload, photo upload, future) is
// responsible for passing a `kind` that resolves to a subdir under this root.
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
// HS namespace: everything HireStream writes lives under uploads/hs/…
// Candidate documents and candidate photos each get their own leaf so the two
// asset classes are disjoint on disk (docs auth-protected, photos public).
export const HS_DOCS_DIR = path.join(UPLOAD_DIR, "hs", "candidates", "docs");
export const HS_PHOTOS_DIR = path.join(UPLOAD_DIR, "hs", "candidates", "photos");
// v0.4.32 (HPSEDC Items 1 & 3): KYB document leaves. Each role gets its own
// directory so the admin queue can never accidentally cross-render docs from
// the wrong owner type. All three leaves are auth-gated download-only.
export const HS_EMPLOYER_DOCS_DIR = path.join(UPLOAD_DIR, "hs", "employers", "docs");
export const HS_AGENCY_DOCS_DIR = path.join(UPLOAD_DIR, "hs", "agencies", "docs");
// v0.4.42: signed appointment letters live on the placement, not an owner —
// own leaf, auth-gated download-only (the candidate's contract document).
export const HS_PLACEMENT_DOCS_DIR = path.join(UPLOAD_DIR, "hs", "placements", "docs");
for (const d of [UPLOAD_DIR, HS_DOCS_DIR, HS_PHOTOS_DIR, HS_EMPLOYER_DOCS_DIR, HS_AGENCY_DOCS_DIR, HS_PLACEMENT_DOCS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const ALLOWED_MIMES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const MAX_SIZE = (env.MAX_FILE_SIZE_MB || 5) * 1024 * 1024; // Default 5MB

// Default storage writes to HS_DOCS_DIR. Profile-photo uploads move the file
// to HS_PHOTOS_DIR after the magic-byte check passes (see candidate-self-service.routes).
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, HS_DOCS_DIR);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename: timestamp-randomhex.ext
    const ext = ALLOWED_MIMES[file.mimetype] || path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_MIMES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Accepted: PDF, JPG, PNG`));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

// ── Magic-byte signature verification ───────────────────────────────────
// Defence against extension spoofing — verify file content matches declared MIME.
// Run AFTER multer in route handler chain. Deletes file and returns 400 on mismatch.
const MAGIC_BYTES: Record<string, { sig: number[]; offset?: number }[]> = {
  "application/pdf": [{ sig: [0x25, 0x50, 0x44, 0x46] }], // "%PDF"
  "image/jpeg": [
    { sig: [0xff, 0xd8, 0xff, 0xe0] }, // JFIF
    { sig: [0xff, 0xd8, 0xff, 0xe1] }, // EXIF
    { sig: [0xff, 0xd8, 0xff, 0xdb] },
    { sig: [0xff, 0xd8, 0xff, 0xee] },
  ],
  "image/png": [{ sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
};

function verifyMagicBytes(filePath: string, mimeType: string): boolean {
  const expected = MAGIC_BYTES[mimeType];
  if (!expected) return false;
  try {
    const fd = fs.openSync(filePath, "r");
    const headerSize = 12;
    const buf = Buffer.alloc(headerSize);
    fs.readSync(fd, buf, 0, headerSize, 0);
    fs.closeSync(fd);

    return expected.some(({ sig, offset = 0 }) => {
      for (let i = 0; i < sig.length; i++) {
        if (buf[offset + i] !== sig[i]) return false;
      }
      return true;
    });
  } catch {
    return false;
  }
}

// Multer error → clean HTTP response. Mount on a route that uses upload.* as
// the LAST middleware so it catches LIMIT_FILE_SIZE / file-filter Errors that
// otherwise bubble to the global handler as a 500. Used by routes that mount
// `upload.single("file")` etc.
export function handleUploadErrors(err: any, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  // multer.MulterError instances have a stable `code`
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: { code: 413, message: `File too large. Limit is ${Math.round(MAX_SIZE / 1024 / 1024)} MB.` },
    });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ success: false, error: { code: 400, message: `Unexpected upload field.` } });
  }
  // fileFilter throws a bare Error("File type not allowed…") — recognised by
  // message prefix since multer doesn't tag those with a stable code.
  if (typeof err.message === "string" && err.message.startsWith("File type not allowed")) {
    return res.status(400).json({ success: false, error: { code: 400, message: err.message } });
  }
  return next(err);
}

export function verifyUploadedFile(req: Request, res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return next();

  // HTIS XLSX-row ("File Upload — Empty file") — multer happily wrote a
  // zero-byte file to disk. Reject before the magic-byte check (which would
  // otherwise flag it as "spoofed" with a confusing message) and clean up.
  if (file.size === 0) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({
      success: false,
      error: { code: 400, message: "File is empty. Please choose a non-empty file to upload." },
    });
  }

  const valid = verifyMagicBytes(file.path, file.mimetype);
  if (!valid) {
    // Delete the spoofed file from disk
    fs.unlink(file.path, () => {});
    return res.status(400).json({
      success: false,
      error: { code: 400, message: "File content does not match declared type. Possible spoofed extension." },
    });
  }
  next();
}

export { UPLOAD_DIR };

// v0.4.32: factory for role-scoped uploaders. Returns a multer instance bound
// to the specified leaf dir so a route can NEVER accidentally write to the
// wrong owner type's directory — the destination is captured at multer
// construction time, not derived per-request. Magic-byte check + filter stay
// identical to the candidate-docs path.
function makeRoleStorage(leafDir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => { cb(null, leafDir); },
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIMES[file.mimetype] || path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, uniqueName);
    },
  });
}

export const employerDocUpload = multer({
  storage: makeRoleStorage(HS_EMPLOYER_DOCS_DIR),
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

export const agencyDocUpload = multer({
  storage: makeRoleStorage(HS_AGENCY_DOCS_DIR),
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

export const placementDocUpload = multer({
  storage: makeRoleStorage(HS_PLACEMENT_DOCS_DIR),
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});
