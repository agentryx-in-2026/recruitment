// Seed a small, varied demo pipeline against the HPSEDC-only job board so the
// candidate "My Application", agent, and admin views aren't empty at first look.
import { config } from "dotenv"; config();
import pg from "pg";
const { Client } = pg;

// (candidate username, job title substring, application status, placementStatus|null)
const PLAN = [
  ["arjun_thakur", "Staff Nurse",   "selected",            "offered"],  // offer pending → candidate sees "make a decision"
  ["priya_verma",  "Cook",          "interview_scheduled", null],
  ["rohit_sharma", "Mason",         "shortlisted",         null],
  ["neha_chauhan", "Caregiver",     "selected",            null],
  ["karan_rana",   "Welder",        "reviewed",            null],
  ["meera_iyer",   "Housekeeping",  "submitted",           null],
  ["vikram_negi",  "Security Guard","submitted",           null],
  ["ananya_bhatt", "ICU Nurse",     "shortlisted",         null],
  ["arjun_thakur", "Electrician",   "placed",              "placed"],   // a completed placement for the pipeline
];

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  let apps = 0, placements = 0;
  for (const [username, jobLike, status, placementStatus] of PLAN) {
    const cand = await c.query(
      "SELECT ca.id, ca.full_name FROM candidates ca JOIN users u ON u.id=ca.user_id WHERE u.username=$1 LIMIT 1", [username]);
    if (!cand.rows.length) { console.log("skip (no candidate):", username); continue; }
    const job = await c.query("SELECT id, country, salary FROM jobs WHERE title ILIKE $1 LIMIT 1", [`%${jobLike}%`]);
    if (!job.rows.length) { console.log("skip (no job):", jobLike); continue; }
    const candId = cand.rows[0].id, jobId = job.rows[0].id;
    const app = await c.query(
      "INSERT INTO applications (candidate_id, job_id, status) VALUES ($1,$2,$3) RETURNING id",
      [candId, jobId, status]);
    apps++;
    if (placementStatus) {
      await c.query(
        "INSERT INTO placements (application_id, country, salary, status) VALUES ($1,$2,$3,$4)",
        [app.rows[0].id, job.rows[0].country, job.rows[0].salary, placementStatus]);
      placements++;
    }
    console.log(`  ${cand.rows[0].full_name} → ${jobLike} (${status}${placementStatus ? " · placement:" + placementStatus : ""})`);
  }
  await c.query("COMMIT");
  console.log(`seeded ${apps} applications, ${placements} placements`);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ROLLED BACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
