import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// Root of everything this app writes. Subdirs ARE the namespace: nothing lands
// in the bare root so Verify files can't collide with any other app's uploads
// even if some future misconfig shares a parent directory.
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
// Verify namespace: signoff screenshots and feedback attachments live in
// dedicated leaves under uploads/verify/ so the domain is self-contained.
export const VERIFY_SIGNOFF_DIR = path.join(UPLOAD_DIR, "verify", "signoff");
export const VERIFY_FEEDBACK_DIR = path.join(UPLOAD_DIR, "verify", "feedback");
for (const d of [UPLOAD_DIR, VERIFY_SIGNOFF_DIR, VERIFY_FEEDBACK_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const ALLOWED_MIMES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  // Piyush, 18 Nov 2026: SVG screenshots too. Served with a sandbox CSP (projects.ts) so an SVG cannot run script.
  "image/svg+xml": ".svg",
};

// Retina / 5K Mac screenshots often land at 6–9 MB, so 5 MB was rejecting
// typical reviewer uploads with a 500 HTML page (no client-visible error).
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;                    // 5 files per upload

const filenameFn = (_req: any, file: Express.Multer.File, cb: (err: any, name: string) => void) => {
  const ext = ALLOWED_MIMES[file.mimetype] ?? path.extname(file.originalname);
  cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
};

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_MIMES[file.mimetype]) cb(null, true);
  else cb(new Error("Only image files allowed (PNG, JPEG, WEBP, GIF, SVG)"));
}

// Two multer instances — one per Verify domain. Binding the destination at
// instance creation keeps the `req` handler code identical across routes while
// guaranteeing that a signoff upload can never accidentally land in the
// feedback leaf (or vice versa). If the directory doesn't exist at request
// time, multer errors out loudly — that's intentional.
const signoffStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VERIFY_SIGNOFF_DIR),
  filename: filenameFn,
});
const feedbackStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VERIFY_FEEDBACK_DIR),
  filename: filenameFn,
});

// Signoff / comment uploader — writes to uploads/verify/signoff/.
// Pre-bound to the "screenshots" form field used by the signoff + comment routes.
export const uploader = multer({
  storage: signoffStorage, fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});
export const uploadImages = uploader.array("screenshots", MAX_FILES);

// Feedback uploader — writes to uploads/verify/feedback/. Used by the ideas
// inbox attachment endpoint, which binds to the "files" form field.
export const feedbackUploader = multer({
  storage: feedbackStorage, fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});
