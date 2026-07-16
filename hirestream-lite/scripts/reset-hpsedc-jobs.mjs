// One-shot: wipe all existing jobs (+ their applications/placements) and reseed
// a fresh board owned ONLY by the HPSEDC mega-agency. Foreign employers are the
// "company"; HPSEDC (the mega-agency agent) is the owning agency.
import { config } from "dotenv"; config();
import pg from "pg";
const { Client } = pg;

const AGENCY_KEY = "capability.default_agency_user_id";

const JOBS = [
  // title, company (foreign employer), location, country, category, salary, skills[], description
  ["Mason", "Al Habtoor Construction", "Dubai", "UAE", "construction", "1,800 AED/month", ["Mason", "Bricklaying", "Plastering"], "Brick and block work on high-rise residential sites. Accommodation and transport provided."],
  ["Welder (Arc & Gas)", "Gulf Steel Works", "Abu Dhabi", "UAE", "construction", "2,200 AED/month", ["Welder", "Arc Welding", "Gas Welding"], "Structural steel welding for industrial projects. Trade test on arrival."],
  ["Electrician", "Saudi Binladin Group", "Riyadh", "Saudi Arabia", "construction", "2,000 SAR/month", ["Electrician", "Wiring", "Maintenance"], "Building electrical installation and maintenance. ITI/electrical certificate preferred."],
  ["Plumber", "Qatar Building Company", "Doha", "Qatar", "construction", "2,100 QAR/month", ["Plumber", "Pipe Fitting"], "Plumbing and pipe-fitting for commercial buildings."],
  ["Carpenter", "Kuwait Interiors LLC", "Kuwait City", "Kuwait", "construction", "220 KWD/month", ["Carpenter", "Woodwork", "Furniture"], "Shuttering and finishing carpentry for fit-out projects."],
  ["Construction Helper", "Oman Builders", "Muscat", "Oman", "construction", "180 OMR/month", ["Construction", "Site Work"], "General site helper. No experience required — training provided."],
  ["Heavy Truck Driver", "Emirates Transport", "Sharjah", "UAE", "transport", "2,500 AED/month", ["Driving", "Heavy Vehicle", "GCC Licence"], "Long-haul goods transport. Valid heavy licence required; GCC conversion supported."],
  ["Delivery Rider", "Talabat", "Dubai", "UAE", "transport", "2,000 AED/month", ["Delivery", "Two-wheeler"], "Food delivery on company motorbike. Incentives on top of base pay."],
  ["Cook (Indian & Continental)", "Marriott Hotels", "Doha", "Qatar", "hospitality", "2,200 QAR/month", ["Cooking", "Indian Cuisine", "Continental"], "Hotel kitchen cook. Experience in Indian and continental cuisine preferred."],
  ["Hotel Steward", "Hilton", "Manama", "Bahrain", "hospitality", "250 BHD/month", ["Hospitality", "Food Service"], "Restaurant and banquet service. English speaking preferred."],
  ["Housekeeping / Cleaner", "Emrill Services", "Dubai", "UAE", "hospitality", "1,300 AED/month", ["Cleaning", "Housekeeping"], "Facilities housekeeping. Accommodation and meals provided."],
  ["Staff Nurse", "NMC Healthcare", "Abu Dhabi", "UAE", "healthcare", "5,500 AED/month", ["Nursing", "Patient Care", "BLS"], "Registered staff nurse for a multi-specialty hospital. HAAD/DHA licence support provided."],
  ["Caregiver", "Amana Healthcare", "Al Ain", "UAE", "healthcare", "3,200 AED/month", ["Caregiving", "Elderly Care"], "Elderly and rehabilitation care. GNM/nursing background preferred."],
  ["ICU Nurse", "Charité Berlin", "Berlin", "Germany", "healthcare", "2,800 EUR/month", ["Nursing", "ICU", "B1 German"], "ICU nursing with visa sponsorship and German language support (B1 required)."],
  ["Factory Machine Operator", "Julphar Pharmaceuticals", "Ras Al Khaimah", "UAE", "manufacturing", "1,600 AED/month", ["Machine Operation", "Assembly"], "Production line machine operation in a pharma plant."],
  ["Tailor / Garment Worker", "Gulf Garments", "Jebel Ali", "UAE", "manufacturing", "1,700 AED/month", ["Tailoring", "Stitching"], "Industrial stitching and garment finishing."],
  ["Security Guard", "Transguard Group", "Dubai", "UAE", "security", "1,800 AED/month", ["Security", "Surveillance"], "Building and site security. SIRA training provided on arrival."],
  ["Farm Worker", "Al Dahra Agriculture", "Abu Dhabi", "UAE", "agriculture", "1,400 AED/month", ["Farming", "Irrigation"], "Greenhouse and field agriculture work."],
  ["Civil Engineer", "Saudi Aramco Contractors", "Dammam", "Saudi Arabia", "engineering", "8,000 SAR/month", ["Civil Engineering", "AutoCAD", "Site Supervision"], "Site civil engineer for infrastructure projects. Degree + 3 years experience."],
  ["IT Support Technician", "Etisalat", "Dubai", "UAE", "it", "6,500 AED/month", ["IT Support", "Networking", "Troubleshooting"], "Desktop and network support. Diploma/degree in IT with 2+ years experience."],
];

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const s = await c.query("SELECT value FROM system_settings WHERE key=$1", [AGENCY_KEY]);
  const agencyId = s.rows[0]?.value;
  if (!agencyId) throw new Error("mega-agency id not set in system_settings");

  await c.query("BEGIN");
  // Delete job-dependent data (children first), then jobs.
  await c.query("DELETE FROM application_notes");
  await c.query("DELETE FROM interviews");
  await c.query("DELETE FROM placements");
  await c.query("DELETE FROM applications");
  await c.query("DELETE FROM saved_jobs");
  const del = await c.query("DELETE FROM jobs");
  console.log(`deleted ${del.rowCount} jobs (+ dependent applications/placements/interviews/notes)`);

  let n = 0;
  for (const [title, company, location, country, category, salary, skills, description] of JOBS) {
    await c.query(
      `INSERT INTO jobs (title, company, location, country, category, salary, skills, description, visibility, status, agent_id, employer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'public','active',$9,NULL)`,
      [title, company, location, country, category, salary, skills, description, agencyId]
    );
    n++;
  }
  await c.query("COMMIT");
  console.log(`inserted ${n} HPSEDC-owned jobs`);

  const check = await c.query("SELECT count(*)::int total, count(*) FILTER (WHERE agent_id=$1)::int hpsedc FROM jobs", [agencyId]);
  console.log("verify:", check.rows[0]);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ROLLED BACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
