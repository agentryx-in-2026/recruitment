import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, pool } from "../server/config/db";
import { reviewers, projects, projectReviewers } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Create (or update the password/role of) a Verify reviewer and attach them to
 * projects. The password comes from the environment so it never lands in a
 * script or the repo.
 *
 *   R_USERNAME=piyush R_PASSWORD='…' R_NAME='Piyush' R_ROLE=agentryx \
 *   R_EMAIL=piyush@agentryx.local R_ORG=Agentryx \
 *   R_PROJECTS=hirestream-lite,hirestream-mobile-v1.0 npx tsx scripts/add-reviewer.ts
 *
 * Note: Verify has no per-test-case assignment — a reviewer signs off in their
 * role's column on every project they can see. R_PROJECTS records membership.
 */
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };

async function main() {
  const username = need("R_USERNAME").toLowerCase().trim();
  const password = need("R_PASSWORD");
  const role = (process.env.R_ROLE || "agentryx") as any;
  const email = (process.env.R_EMAIL || `${username}@agentryx.local`).toLowerCase();
  const name = process.env.R_NAME || username;
  const organization = process.env.R_ORG || "Agentryx";
  const passwordHash = await bcrypt.hash(password, 10);

  let [r] = await db.select().from(reviewers).where(eq(reviewers.username, username));
  if (r) {
    [r] = await db.update(reviewers).set({ passwordHash, role, name, organization }).where(eq(reviewers.id, r.id)).returning();
    console.log(`Updated reviewer ${username} (${role}).`);
  } else {
    [r] = await db.insert(reviewers).values({ username, email, name, organization, role, passwordHash }).returning();
    console.log(`Created reviewer ${username} (${role}), email ${email}.`);
  }

  const slugs = (process.env.R_PROJECTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (slugs.length) {
    const ps = await db.select().from(projects).where(inArray(projects.slug, slugs));
    for (const p of ps) await db.insert(projectReviewers).values({ projectId: p.id, reviewerId: r.id }).onConflictDoNothing();
    console.log(`Attached to: ${ps.map((p) => p.slug).join(", ")}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
