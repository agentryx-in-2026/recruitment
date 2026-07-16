/**
 * One-shot migration: move every file under uploads/ into its namespaced leaf
 * and rewrite the DB URL columns so the new routes can find them.
 *
 *   Before:
 *     uploads/<hash>.pdf                    (candidate docs, seed assets, stragglers)
 *     uploads/photos/<hash>.png             (candidate photos — interim layout)
 *   After:
 *     uploads/hs/candidates/docs/<hash>.pdf
 *     uploads/hs/candidates/photos/<hash>.png
 *
 * Idempotent: re-running after a partial migration is safe (rename is skipped
 * for files already at the new location, and DB updates are no-op when the
 * URL is already namespaced).
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import "dotenv/config";

const ROOT = path.resolve(process.cwd(), "uploads");
const DOCS_DIR = path.join(ROOT, "hs", "candidates", "docs");
const PHOTOS_DIR = path.join(ROOT, "hs", "candidates", "photos");

function mkdirp(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function moveIfNeeded(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dest)) return false; // already moved
  fs.renameSync(src, dest);
  return true;
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url });

  mkdirp(DOCS_DIR); mkdirp(PHOTOS_DIR);

  // ── 1. Photos ──────────────────────────────────────────────────────
  // Interim layout was uploads/photos/<name>. Move to hs/candidates/photos/
  // and rewrite candidates.photo_url.
  const legacyPhotos = path.join(ROOT, "photos");
  let photosMoved = 0;
  if (fs.existsSync(legacyPhotos)) {
    for (const name of fs.readdirSync(legacyPhotos)) {
      const src = path.join(legacyPhotos, name);
      if (!fs.statSync(src).isFile()) continue;
      const dest = path.join(PHOTOS_DIR, name);
      if (moveIfNeeded(src, dest)) photosMoved++;
    }
  }
  const photoRewrite = await pool.query(`
    UPDATE candidates
    SET photo_url = REPLACE(photo_url, '/uploads/photos/', '/uploads/hs/candidates/photos/')
    WHERE photo_url LIKE '/uploads/photos/%'`);
  console.log(`photos: moved ${photosMoved} file(s), rewrote ${photoRewrite.rowCount} candidate.photo_url`);

  // ── 2. Documents ───────────────────────────────────────────────────
  // Files were written bare in uploads/<name>. Move anything referenced by a
  // documents row into hs/candidates/docs/. Rewrite file_url.
  const docRows = await pool.query(`SELECT id, file_url FROM documents`);
  let docsMoved = 0, docsRewritten = 0, docsMissing = 0;
  for (const r of docRows.rows) {
    const url: string = r.file_url ?? "";
    if (!url.startsWith("/uploads/")) continue;
    if (url.startsWith("/uploads/hs/")) continue; // already namespaced

    const relative = url.replace(/^\/uploads\//, ""); // may include leading subdir; we only migrate bare-root
    if (relative.includes("/")) continue; // anything with a subdir isn't a flat doc
    const src = path.join(ROOT, relative);
    const dest = path.join(DOCS_DIR, relative);
    if (fs.existsSync(src) && !fs.existsSync(dest)) { fs.renameSync(src, dest); docsMoved++; }
    else if (!fs.existsSync(src) && !fs.existsSync(dest)) { docsMissing++; }
    const newUrl = `/uploads/hs/candidates/docs/${relative}`;
    await pool.query(`UPDATE documents SET file_url = $1 WHERE id = $2`, [newUrl, r.id]);
    docsRewritten++;
  }
  console.log(`docs:   moved ${docsMoved} file(s), rewrote ${docsRewritten} row(s), ${docsMissing} not on disk`);

  // ── 3. Resume URLs (candidates.resume_url) ─────────────────────────
  const resumeRewrite = await pool.query(`
    UPDATE candidates
    SET resume_url = REPLACE(resume_url, '/uploads/', '/uploads/hs/candidates/docs/')
    WHERE resume_url LIKE '/uploads/%' AND resume_url NOT LIKE '/uploads/hs/%'`);
  console.log(`resumes: rewrote ${resumeRewrite.rowCount} candidate.resume_url`);

  // ── 4. Orphan scan — files still loose in the root that aren't bound to
  //    any documents row. These are pre-v0.8 seed assets and test artifacts.
  //    We quarantine them under uploads/hs/candidates/docs/orphans/ so they're
  //    out of the naked root but still recoverable.
  const orphanDir = path.join(DOCS_DIR, "orphans");
  mkdirp(orphanDir);
  let orphans = 0;
  for (const name of fs.readdirSync(ROOT)) {
    const p = path.join(ROOT, name);
    if (!fs.statSync(p).isFile()) continue; // skip subdirs
    const dest = path.join(orphanDir, name);
    if (!fs.existsSync(dest)) { fs.renameSync(p, dest); orphans++; }
  }
  console.log(`orphans: quarantined ${orphans} unreferenced file(s) under hs/candidates/docs/orphans/`);

  await pool.end();
})();
