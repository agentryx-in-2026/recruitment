/**
 * UAT reseed — a curated cast on the CURRENT architecture.
 *
 * ── Why this is a separate script from scripts/seed.ts ─────────────────────
 * seed.ts builds the retired marketplace demo: 10 agencies, 10 employers, 28
 * jobs of its own, candidates carrying only the legacy `skills[]` array. Phase 1
 * is HPSEDC-as-single-agency with 20 government vacancies that already exist in
 * the database and are referenced by live applications. Rewriting seed.ts would
 * mean destroying and recreating those jobs; this script PRESERVES them and
 * replaces only the candidate-side data.
 *
 * ── What the old data got wrong, and this fixes ────────────────────────────
 * 83 of 89 candidates had no `candidate_professions` rows at all, because the
 * old seed wrote only `skills[]`. That is why UAT-05 item 21 — profession-
 * specific mandatory qualifications and documents — fired for nobody: the
 * resolver had no profession to scope on. A demo walkthrough could never show
 * the feature working. Every candidate here has real profession rows with the
 * add-on data the registration form actually collects.
 *
 * Also fixed relative to the old seed: emailVerified (without it the apply gate
 * blocks every seeded candidate), DOB/Aadhaar/WhatsApp/homeTown/district/
 * disability (UAT-05 items 5/12/13/16 columns it never wrote), placement
 * countries as full country_info names, and no application in `reviewed` or
 * `shortlisted` — stages the compact pipeline does not run.
 *
 * ── Safety ─────────────────────────────────────────────────────────────────
 * Destructive by design. Refuses to run against a database whose URL does not
 * look like the UAT one unless --force is passed. Take a pg_dump first.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import fs from "fs";
import { sql, eq, or, ne, inArray, notInArray } from "drizzle-orm";
import { storage } from "../server/storage";
import {
  users, candidates, candidateEducation, candidateExperience, candidateLanguages,
  candidateProfessions, applications, placements, interviews, documents, notifications,
  savedJobs, jobs,
} from "@shared/schema";

// ── Accounts that must survive ─────────────────────────────────────────────
// hpsedc_agency is load-bearing twice: it owns all 20 live jobs, and its user
// id is stored in the capability.default_agency_user_id setting. Deleting it
// orphans every vacancy.
const KEEP_USERNAMES = [
  "demo_candidate", "demo_agent", "demo_employer", "demo_admin", "superadmin", "hpsedc_agency",
];
// The operator's real logins. Their PROFILES are junk and get cleared, but the
// accounts stay so they can still sign in — and land on the fresh form, which
// is itself the item-2 demo.
const KEEP_EMAILS = [
  "subhash.thakur.india@gmail.com", "subhash.thakur.us@gmail.com",
  "subhash.thakur2010@gmail.com", "subhash.thakur2012a@gmail.com",
  "subhash.thakur@agentryx.in", "subhash.thakur@me.com",
  "aarav.thakur2008@gmail.com",
  "microaistudio@gmail.com", "microaistudio2025@gmail.com", "microaistudio2026@gmail.com",
];

// ── Verhoeff-valid Aadhaar numbers ─────────────────────────────────────────
// Generated against the same tables shared/aadhaar.ts validates with; asserted
// at the end of this script rather than trusted.
const AADHAAR = [
  "234500000110","234501371480","234502742859","234504114224","234505485599","234506856968",
  "234508228335","234509599709","234510971073","234512342444","234513713814","234515085181",
  "234516456557","234517827923","234519199298","234520570667","234521942032","234523313404",
  "234524684775","234526056148",
];

type Stage = "submitted" | "interview_scheduled" | "selected" | "placed" | "rejected";

interface CastMember {
  first: string; last: string; sex: "male" | "female"; dob: string;
  district: string; homeTown: string; pin: string;
  father: string; mother: string;
  profession: string; months: number; skills: string[];
  addon?: Record<string, any>;
  edu: { degree: string; type: string; board?: string; institution: string; year: number };
  exp?: { company: string; role: string; years: number; country?: string };
  langs: { language: string; proficiency: string }[];
  passport?: { number: string; issue: string; expiry: string; place: string };
  noPassport?: boolean;
  ecr: "ecr" | "ecnr";
  disability?: { type: string };
  noAadhaar?: boolean;
  jobTitle: string;
  stage: Stage;
  rejectionFeedback?: string;
  secondProfession?: { key: string; months: number; skills: string[] };
}

const HINDI = { language: "Hindi", proficiency: "native" };
const ENG_BASIC = { language: "English", proficiency: "elementary" };
const ENG_MID = { language: "English", proficiency: "intermediate" };
const ARABIC = { language: "Arabic", proficiency: "elementary" };

const CAST: CastMember[] = [
  { first: "Nirmala", last: "Devi", sex: "female", dob: "1994-06-12", district: "Kangra", homeTown: "Palampur", pin: "176061",
    father: "Ram Lal", mother: "Sarla Devi", profession: "nurse", months: 66, skills: ["ICU", "General Ward"],
    addon: { qualification: "GNM", institution: "District Hospital School of Nursing, Dharamshala", year: 2015,
             councilRegNumber: "HPNRC/RN/2015/18342", councilName: "HP Nurses Registration Council (HPNRC)", councilValidUntil: "2028-03-31" },
    edu: { degree: "College degree", type: "university", institution: "District Hospital School of Nursing, Dharamshala", year: 2015 },
    exp: { company: "District Hospital, Kangra", role: "Staff Nurse", years: 5 },
    langs: [HINDI, ENG_MID], passport: { number: "Z4128841", issue: "2021-03-10", expiry: "2031-03-09", place: "Shimla" },
    ecr: "ecnr", jobTitle: "Staff Nurse", stage: "selected" },

  { first: "Shalini", last: "Rathore", sex: "female", dob: "1997-02-03", district: "Shimla", homeTown: "Theog", pin: "171201",
    father: "Devinder Singh", mother: "Kamla Rathore", profession: "nurse", months: 42, skills: ["ICU"],
    addon: { qualification: "B.Sc. Nursing", institution: "State College of Nursing, Shimla", year: 2019,
             councilRegNumber: "HPNRC/RN/2019/24471", councilName: "HP Nurses Registration Council (HPNRC)", councilValidUntil: "2027-09-30" },
    edu: { degree: "College degree", type: "university", institution: "State College of Nursing, Shimla", year: 2019 },
    exp: { company: "Regional Hospital, Shimla", role: "Staff Nurse", years: 3 },
    langs: [HINDI, ENG_MID], passport: { number: "U6642210", issue: "2022-07-01", expiry: "2032-06-30", place: "Shimla" },
    ecr: "ecnr", jobTitle: "ICU Nurse", stage: "interview_scheduled" },

  { first: "Anita", last: "Kumari", sex: "female", dob: "1992-11-25", district: "Mandi", homeTown: "Sundernagar", pin: "175018",
    father: "Hari Singh", mother: "Bimla Devi", profession: "caregiver", months: 84, skills: ["Elderly care", "Bedridden patient care"],
    addon: { qualification: "Caregiver training certificate", institution: "HP Skill Development Centre, Mandi", year: 2018, courseMonths: 6 },
    edu: { degree: "12th pass", type: "school", board: "HPBOSE", institution: "Govt Senior Secondary School, Sundernagar", year: 2010 },
    exp: { company: "Private home care, Dubai", role: "Caregiver", years: 4, country: "United Arab Emirates" },
    langs: [HINDI, ENG_BASIC, ARABIC], passport: { number: "R5510337", issue: "2019-05-20", expiry: "2029-05-19", place: "Shimla" },
    ecr: "ecr", jobTitle: "Caregiver", stage: "placed" },

  { first: "Babita", last: "Thakur", sex: "female", dob: "2001-08-14", district: "Bilaspur", homeTown: "Ghumarwin", pin: "174021",
    father: "Prem Chand", mother: "Nirmala Devi", profession: "caregiver", months: 18, skills: ["Elderly care"],
    addon: { qualification: "No certificate yet" },
    edu: { degree: "12th pass", type: "school", board: "HPBOSE", institution: "Govt Senior Secondary School, Ghumarwin", year: 2019 },
    langs: [HINDI, ENG_BASIC], noPassport: true, ecr: "ecr", jobTitle: "Caregiver", stage: "submitted" },

  { first: "Suresh", last: "Thakur", sex: "male", dob: "1988-01-30", district: "Una", homeTown: "Amb", pin: "177203",
    father: "Karam Chand", mother: "Shanti Devi", profession: "driver", months: 132, skills: ["Heavy truck", "Tanker"],
    addon: { licenceNumber: "HP-38 20120004521", licenceClass: "HMV", licenceValidUntil: "2028-06-30", badgeHeld: true, drivenAbroad: true, abroadCountry: "United Arab Emirates" },
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Amb", year: 2004 },
    exp: { company: "Transport contractor, Dubai", role: "Heavy Truck Driver", years: 6, country: "United Arab Emirates" },
    langs: [HINDI, ENG_BASIC, ARABIC], passport: { number: "N7733012", issue: "2018-09-14", expiry: "2028-09-13", place: "Shimla" },
    ecr: "ecr", jobTitle: "Heavy Truck Driver", stage: "selected" },

  { first: "Dinesh", last: "Kumar", sex: "male", dob: "1999-04-22", district: "Hamirpur", homeTown: "Nadaun", pin: "177033",
    father: "Sohan Lal", mother: "Reena Devi", profession: "driver", months: 30, skills: ["Light vehicle"],
    addon: { licenceNumber: "HP-12 20210007733", licenceClass: "LMV", licenceValidUntil: "2029-01-15", badgeHeld: false, drivenAbroad: false },
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Nadaun", year: 2015 },
    langs: [HINDI, ENG_BASIC], noPassport: true, ecr: "ecr", jobTitle: "Delivery Rider", stage: "submitted" },

  { first: "Rakesh", last: "Verma", sex: "male", dob: "1990-09-05", district: "Mandi", homeTown: "Jogindernagar", pin: "175015",
    father: "Bhagat Ram", mother: "Sunita Devi", profession: "welder", months: 120, skills: ["Arc / SMAW", "6G pipe"],
    addon: { qualification: "ITI — Welder", institution: "Govt. ITI Mandi", year: 2010, tradeTestPassed: true },
    edu: { degree: "ITI", type: "diploma", institution: "Govt. ITI Mandi", year: 2010 },
    exp: { company: "Fabrication contractor, Sharjah", role: "Welder", years: 7, country: "United Arab Emirates" },
    langs: [HINDI, ENG_BASIC, ARABIC], passport: { number: "P4408821", issue: "2017-02-11", expiry: "2027-02-10", place: "Shimla" },
    ecr: "ecr", jobTitle: "Welder (Arc & Gas)", stage: "placed" },

  { first: "Sanjay", last: "Chauhan", sex: "male", dob: "1995-12-17", district: "Kullu", homeTown: "Bhuntar", pin: "175125",
    father: "Tara Chand", mother: "Anjana Devi", profession: "welder", months: 72, skills: ["Arc / SMAW"],
    addon: { qualification: "ITI — Welder", institution: "Govt. ITI Kullu", year: 2016, tradeTestPassed: false },
    edu: { degree: "ITI", type: "diploma", institution: "Govt. ITI Kullu", year: 2016 },
    exp: { company: "Local fabrication unit, Kullu", role: "Welder", years: 5 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P8810440", issue: "2020-11-05", expiry: "2030-11-04", place: "Shimla" },
    ecr: "ecr", jobTitle: "Welder (Arc & Gas)", stage: "interview_scheduled",
    secondProfession: { key: "mechanic", months: 24, skills: [] } },

  { first: "Om", last: "Prakash", sex: "male", dob: "1991-03-08", district: "Sirmaur", homeTown: "Nahan", pin: "173001",
    father: "Ram Dayal", mother: "Kaushalya Devi", profession: "electrician", months: 96, skills: ["Wiring", "Panel work"],
    addon: { qualification: "ITI — Electrician", institution: "Govt. ITI Nahan", year: 2011, certBody: "NCVT" },
    edu: { degree: "ITI", type: "diploma", institution: "Govt. ITI Nahan", year: 2011 },
    exp: { company: "Electrical contractor, Nahan", role: "Electrician", years: 8 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P5590338", issue: "2019-08-22", expiry: "2029-08-21", place: "Shimla" },
    ecr: "ecr", jobTitle: "Electrician", stage: "selected" },

  { first: "Rajeev", last: "Sharma", sex: "male", dob: "1998-07-19", district: "Solan", homeTown: "Baddi", pin: "173205",
    father: "Mohinder Sharma", mother: "Pushpa Devi", profession: "electrician", months: 36, skills: ["Wiring"],
    addon: { qualification: "ITI — Electrician", institution: "Govt. ITI Solan", year: 2018, certBody: "SCVT" },
    edu: { degree: "ITI", type: "diploma", institution: "Govt. ITI Solan", year: 2018 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P6604219", issue: "2022-01-18", expiry: "2032-01-17", place: "Shimla" },
    ecr: "ecr", jobTitle: "Electrician", stage: "submitted" },

  { first: "Mohan", last: "Lal", sex: "male", dob: "1985-05-02", district: "Chamba", homeTown: "Chamba", pin: "176310",
    father: "Dhani Ram", mother: "Leela Devi", profession: "mason", months: 180, skills: ["Block work", "Plastering"],
    edu: { degree: "8th pass", type: "school", board: "HPBOSE", institution: "Govt Middle School, Chamba", year: 2000 },
    exp: { company: "Building contractor, Chamba", role: "Mason", years: 12 },
    langs: [HINDI], passport: { number: "M2210455", issue: "2016-06-30", expiry: "2026-12-29", place: "Shimla" },
    ecr: "ecr", jobTitle: "Mason", stage: "interview_scheduled" },

  { first: "Tek", last: "Chand", sex: "male", dob: "1993-10-11", district: "Kangra", homeTown: "Dehra", pin: "177101",
    father: "Piar Chand", mother: "Sudesh Kumari", profession: "mason", months: 60, skills: ["Plastering"],
    edu: { degree: "8th pass", type: "school", board: "HPBOSE", institution: "Govt Middle School, Dehra", year: 2008 },
    langs: [HINDI], passport: { number: "P7719450", issue: "2021-04-12", expiry: "2031-04-11", place: "Shimla" },
    ecr: "ecr", jobTitle: "Mason", stage: "rejected",
    rejectionFeedback: "The employer needed block-work and shuttering experience; the profile shows plastering only. Please update your skills and re-apply — HPSEDC will consider you for the next mason vacancy." },

  { first: "Devraj", last: "Negi", sex: "male", dob: "1996-01-26", district: "Kinnaur", homeTown: "Reckong Peo", pin: "172107",
    father: "Sher Singh", mother: "Dolma Devi", profession: "carpenter", months: 84, skills: ["Shuttering"],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Reckong Peo", year: 2012 },
    exp: { company: "Furniture workshop, Reckong Peo", role: "Carpenter", years: 6 },
    langs: [HINDI], passport: { number: "P9021764", issue: "2022-03-09", expiry: "2032-03-08", place: "Shimla" },
    ecr: "ecr", noAadhaar: true, jobTitle: "Carpenter", stage: "submitted" },

  { first: "Vijay", last: "Katoch", sex: "male", dob: "1994-08-08", district: "Kangra", homeTown: "Jawali", pin: "176023",
    father: "Onkar Singh", mother: "Veena Devi", profession: "plumber", months: 90, skills: ["Pipe fitting"],
    edu: { degree: "ITI", type: "diploma", institution: "Govt. ITI Kangra", year: 2013 },
    exp: { company: "Plumbing contractor, Kangra", role: "Plumber", years: 7 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P5512908", issue: "2020-02-14", expiry: "2030-02-13", place: "Shimla" },
    ecr: "ecr", jobTitle: "Plumber", stage: "interview_scheduled" },

  { first: "Kamlesh", last: "Kumar", sex: "male", dob: "1997-03-15", district: "Mandi", homeTown: "Karsog", pin: "175011",
    father: "Nek Ram", mother: "Sita Devi", profession: "helper", months: 48, skills: [],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Karsog", year: 2013 },
    exp: { company: "Construction site, Muscat", role: "Helper", years: 4, country: "Oman" },
    langs: [HINDI, ENG_BASIC], passport: { number: "P6620145", issue: "2021-09-01", expiry: "2031-08-31", place: "Shimla" },
    ecr: "ecr", jobTitle: "Construction Helper", stage: "placed" },

  { first: "Ramesh", last: "Chand", sex: "male", dob: "2000-06-09", district: "Sirmaur", homeTown: "Paonta Sahib", pin: "173025",
    father: "Jagdish Chand", mother: "Meena Devi", profession: "farm_worker", months: 36, skills: [],
    edu: { degree: "8th pass", type: "school", board: "HPBOSE", institution: "Govt Middle School, Paonta Sahib", year: 2016 },
    langs: [HINDI], noPassport: true, ecr: "ecr", jobTitle: "Farm Worker", stage: "submitted",
    secondProfession: { key: "helper", months: 12, skills: [] } },

  { first: "Kishori", last: "Lal", sex: "male", dob: "1989-12-24", district: "Shimla", homeTown: "Rampur", pin: "172001",
    father: "Roshan Lal", mother: "Kamla Devi", profession: "cook", months: 144, skills: ["Indian", "Continental"],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Rampur", year: 2006 },
    exp: { company: "Hotel kitchen, Shimla", role: "Cook", years: 10 },
    langs: [HINDI, ENG_MID], passport: { number: "P4521889", issue: "2018-12-03", expiry: "2028-12-02", place: "Shimla" },
    ecr: "ecr", jobTitle: "Cook (Indian & Continental)", stage: "selected" },

  { first: "Sunil", last: "Jaryal", sex: "male", dob: "1999-09-30", district: "Hamirpur", homeTown: "Sujanpur", pin: "177021",
    father: "Rattan Chand", mother: "Asha Devi", profession: "waiter", months: 30, skills: ["Table service"],
    edu: { degree: "12th pass", type: "school", board: "HPBOSE", institution: "Govt Senior Secondary School, Sujanpur", year: 2017 },
    langs: [HINDI, ENG_MID], passport: { number: "P8810337", issue: "2022-05-16", expiry: "2032-05-15", place: "Shimla" },
    ecr: "ecr", noAadhaar: true, jobTitle: "Hotel Steward", stage: "submitted" },

  { first: "Champa", last: "Devi", sex: "female", dob: "1993-04-18", district: "Solan", homeTown: "Arki", pin: "173208",
    father: "Amar Singh", mother: "Roshni Devi", profession: "housekeeping", months: 96, skills: ["Room cleaning"],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Arki", year: 2009 },
    exp: { company: "Hotel housekeeping, Solan", role: "Housekeeping Attendant", years: 8 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P3319208", issue: "2021-07-27", expiry: "2031-07-26", place: "Shimla" },
    ecr: "ecr", jobTitle: "Housekeeping / Cleaner", stage: "interview_scheduled" },

  { first: "Lata", last: "Sharma", sex: "female", dob: "1996-11-07", district: "Bilaspur", homeTown: "Bilaspur", pin: "174001",
    father: "Kesar Singh", mother: "Promila Devi", profession: "housekeeping", months: 24, skills: ["Room cleaning"],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Bilaspur", year: 2012 },
    langs: [HINDI], passport: { number: "P2231908", issue: "2022-10-04", expiry: "2032-10-03", place: "Shimla" },
    ecr: "ecr", jobTitle: "Housekeeping / Cleaner", stage: "rejected",
    rejectionFeedback: "This vacancy needed hospital-housekeeping exposure; your experience so far is hotel-only. HPSEDC will match you to hotel housekeeping roles as they open." },

  { first: "Geeta", last: "Bhandari", sex: "female", dob: "1995-02-28", district: "Una", homeTown: "Haroli", pin: "177220",
    father: "Balbir Singh", mother: "Krishna Devi", profession: "tailor", months: 108, skills: ["Stitching"],
    edu: { degree: "10th pass", type: "school", board: "HPBOSE", institution: "Govt High School, Haroli", year: 2011 },
    exp: { company: "Garment unit, Una", role: "Tailor", years: 9 },
    langs: [HINDI], noPassport: true, ecr: "ecr", disability: { type: "Hearing impairment (partial)" },
    jobTitle: "Tailor / Garment Worker", stage: "submitted" },

  { first: "Prem", last: "Singh", sex: "male", dob: "1987-07-21", district: "Chamba", homeTown: "Dalhousie", pin: "176304",
    father: "Gurdial Singh", mother: "Satya Devi", profession: "security_guard", months: 156, skills: [],
    edu: { degree: "12th pass", type: "school", board: "HPBOSE", institution: "Govt Senior Secondary School, Dalhousie", year: 2005 },
    exp: { company: "Security agency, Chamba", role: "Security Guard", years: 13 },
    langs: [HINDI, ENG_BASIC], passport: { number: "P1129004", issue: "2017-11-23", expiry: "2027-11-22", place: "Shimla" },
    ecr: "ecr", disability: { type: "Locomotor — left leg (minor)" },
    jobTitle: "Security Guard", stage: "submitted",
    secondProfession: { key: "helper", months: 24, skills: [] } },
];

// Gender-matched demo photos, reused from the previous cast's files on disk
// (uploads/hs/candidates/photos). Cycled within gender so a female nurse never
// gets a male face; some faces repeat, which is fine for a demo and far better
// than blank initials.
const MALE_PHOTOS = ["arjun_thakur", "rohit_sharma", "karan_rana", "vikram_negi", "aman_kapoor", "sahil_verma"];
const FEMALE_PHOTOS = ["priya_verma", "neha_chauhan", "meera_iyer", "ananya_bhatt"];
let malePhoto = 0, femalePhoto = 0;
const nextPhoto = (sex: "male" | "female", username: string) => {
  // copy the source file to this username so photoUrl resolves cleanly
  try {
    const src = sex === "female" ? FEMALE_PHOTOS[femalePhoto++ % FEMALE_PHOTOS.length]
                                 : MALE_PHOTOS[malePhoto++ % MALE_PHOTOS.length];
    const dir = "uploads/hs/candidates/photos";
    fs.copyFileSync(`${dir}/${src}.jpg`, `${dir}/${username}.jpg`);
    return `/uploads/hs/candidates/photos/${username}.jpg?v=3`;
  } catch { return null; }
};

const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  const force = process.argv.includes("--force");
  const url = process.env.DATABASE_URL || "";
  if (!/hirestream_lite/.test(url) && !force) {
    throw new Error(`Refusing to reseed: DATABASE_URL does not look like the lite UAT database. Pass --force to override.`);
  }
  const db = storage.db;
  if (!db) throw new Error("No database connection.");

  console.log("→ Reseeding UAT cast. Jobs, professions, settings and templates are preserved.\n");

  // ── 1. Which users survive ───────────────────────────────────────────────
  const keepRows = await db.select({ id: users.id, username: users.username })
    .from(users)
    .where(or(
      inArray(users.username, KEEP_USERNAMES),
      inArray(users.email, KEEP_EMAILS),
      ne(users.role, "candidate"),
    ));
  const keepIds = keepRows.map((r: any) => r.id);
  console.log(`  preserving ${keepIds.length} user account(s) (demo logins, staff, agencies, employers, operator)`);

  // ── 2. Wipe candidate-side data, children first ─────────────────────────
  await db.execute(sql`DELETE FROM interviews`);
  await db.execute(sql`DELETE FROM placements`);
  await db.execute(sql`DELETE FROM application_notes`);
  await db.execute(sql`DELETE FROM applications`);
  await db.execute(sql`DELETE FROM documents`);
  await db.execute(sql`DELETE FROM candidate_education`);
  await db.execute(sql`DELETE FROM candidate_experience`);
  await db.execute(sql`DELETE FROM candidate_languages`);
  await db.execute(sql`DELETE FROM candidate_references`);
  await db.execute(sql`DELETE FROM candidate_agent_tags`);
  await db.execute(sql`DELETE FROM candidate_professions`);
  await db.execute(sql`DELETE FROM support_messages`);
  await db.execute(sql`DELETE FROM post_placement_support`);
  await db.execute(sql`DELETE FROM saved_jobs`);
  await db.execute(sql`DELETE FROM drive_registrations`);
  await db.execute(sql`DELETE FROM candidates`);
  // Users last, and only those not on the keep list. audit_log.user_id is a
  // NOT NULL FK, so their audit rows go with them.
  // Everything else that FKs to users. Missing one of these does not fail
  // safely — it aborts mid-wipe with the candidate tables already emptied.
  await db.execute(sql`DELETE FROM grievance_comments`);
  await db.execute(sql`DELETE FROM grievances`);
  await db.execute(sql`DELETE FROM agency_reviews`);
  await db.execute(sql`DELETE FROM saved_searches`);
  await db.execute(sql`DELETE FROM saved_segments`);
  await db.execute(sql`DELETE FROM password_reset_tokens`);
  await db.execute(sql`DELETE FROM mobile_refresh_tokens`);
  await db.execute(sql`DELETE FROM mobile_push_tokens`);
  await db.execute(sql`DELETE FROM otp_codes`);
  await db.delete(notifications).where(notInArray(notifications.userId, keepIds));
  await db.execute(sql`DELETE FROM audit_log WHERE user_id NOT IN (${sql.join(keepIds.map((id: string) => sql`${id}`), sql`, `)})`);
  await db.delete(users).where(notInArray(users.id, keepIds));
  console.log("  wiped candidate-side data\n");

  // ── 3. Job lookup by title ──────────────────────────────────────────────
  const jobRows = await db.select({ id: jobs.id, title: jobs.title, country: jobs.country }).from(jobs);
  const jobByTitle = new Map(jobRows.map((j: any) => [j.title, j]));

  const hash = await bcrypt.hash("test123", 10);
  let aadhaarIdx = 0;
  const summary: Record<string, number> = {};

  for (const c of CAST) {
    const username = `${c.first.toLowerCase()}_${c.last.toLowerCase()}`;
    const email = `${c.first.toLowerCase()}.${c.last.toLowerCase()}@hirestream.dev`;

    const [u] = await db.insert(users).values({
      username, email, password: hash, role: "candidate",
      // Without this the apply gate blocks every seeded candidate — the old
      // seed's omission, patched by hand on the UAT box and nowhere else.
      emailVerified: true, emailVerifiedAt: new Date(),
      preferredLanguage: "en", isActive: true,
    } as any).returning();

    const phone = `+91 98${String(100 + aadhaarIdx).slice(0, 3)} ${String(10000 + aadhaarIdx * 37).slice(0, 5)}`;
    const [cand] = await db.insert(candidates).values({
      userId: u.id, fullName: `${c.first} ${c.last}`, email,
      phone, whatsappNumber: phone, sex: c.sex, dateOfBirth: c.dob,
      fatherName: c.father, motherName: c.mother,
      homeTown: c.homeTown,
      permanentAddressLine1: `Ward 4, ${c.homeTown}`, permanentDistrict: c.district,
      permanentState: "Himachal Pradesh", permanentPinCode: c.pin,
      addressLine1: `Ward 4, ${c.homeTown}`, district: c.district,
      state: "Himachal Pradesh", pinCode: c.pin,
      location: `${c.district}, Himachal Pradesh`,
      disabilityStatus: c.disability ? "yes" : "no",
      disabilityType: c.disability?.type ?? null,
      aadhaarNumber: c.noAadhaar ? null : AADHAAR[aadhaarIdx++],
      passportNumber: c.passport?.number ?? null,
      passportIssueDate: c.passport?.issue ?? null,
      passportExpiry: c.passport?.expiry ?? null,
      passportIssuePlace: c.passport?.place ?? null,
      noPassportYet: Boolean(c.noPassport),
      ecrStatus: c.ecr,
      qualificationLevel: c.edu.degree === "College degree" ? "degree"
        : c.edu.degree === "ITI" ? "iti"
        : c.edu.degree === "12th pass" ? "class12"
        : c.edu.degree === "10th pass" ? "class10" : "class8",
      experienceMonths: Math.max(c.months, c.secondProfession?.months ?? 0),
      experience: Math.round(Math.max(c.months, c.secondProfession?.months ?? 0) / 12),
      skills: [c.profession],
      preferredCountries: ["United Arab Emirates"],
      profileComplete: true, openToOutreach: true,
      registrationTier: "standard",
      photoUrl: nextPhoto(c.sex, username),
    } as any).returning();

    await db.insert(candidateProfessions).values({
      candidateId: cand.id, professionKey: c.profession, experienceMonths: c.months,
      specificSkills: c.skills, addonData: c.addon ?? {},
      lastEmployerName: c.exp?.company ?? null, lastEmployerCountry: c.exp?.country ?? null,
    } as any);
    if (c.secondProfession) {
      await db.insert(candidateProfessions).values({
        candidateId: cand.id, professionKey: c.secondProfession.key,
        experienceMonths: c.secondProfession.months, specificSkills: c.secondProfession.skills, addonData: {},
      } as any);
    }

    await db.insert(candidateEducation).values({
      candidateId: cand.id, degree: c.edu.degree, type: c.edu.type,
      board: c.edu.board ?? null, institution: c.edu.institution, year: c.edu.year, isPassed: true,
    } as any);

    if (c.exp) {
      await db.insert(candidateExperience).values({
        candidateId: cand.id, company: c.exp.company, role: c.exp.role, years: c.exp.years,
      } as any);
    }

    for (const l of c.langs) {
      await db.insert(candidateLanguages).values({
        candidateId: cand.id, language: l.language, proficiency: l.proficiency,
      } as any);
    }

    // ── application + downstream rows ─────────────────────────────────────
    const job: any = jobByTitle.get(c.jobTitle);
    if (!job) { console.warn(`  ! no job titled "${c.jobTitle}" — skipping application for ${username}`); continue; }

    const [appRow] = await db.insert(applications).values({
      candidateId: cand.id, jobId: job.id, status: c.stage,
      matchScore: 55 + ((aadhaarIdx * 7) % 40),
      appliedAt: daysFromNow(-(3 + (aadhaarIdx * 3) % 42)),
      rejectionFeedback: c.rejectionFeedback ?? null,
    } as any).returning();

    if (c.stage === "interview_scheduled") {
      await db.insert(interviews).values({
        applicationId: appRow.id, scheduledAt: daysFromNow(3 + (aadhaarIdx % 8)),
        mode: aadhaarIdx % 3 === 0 ? "virtual" : "in_person",
        location: aadhaarIdx % 3 === 0 ? null : "HPSEDC Office, Nigam Vihar, Shimla",
        meetingLink: aadhaarIdx % 3 === 0 ? "https://meet.hpsedc.gov.in/interview" : null,
        interviewerName: "HPSEDC Placement Officer",
      } as any);
    }

    if (c.stage === "selected" || c.stage === "placed") {
      await db.insert(interviews).values({
        applicationId: appRow.id, scheduledAt: daysFromNow(-(7 + aadhaarIdx % 8)),
        mode: "in_person", location: "HPSEDC Office, Nigam Vihar, Shimla",
        interviewerName: "HPSEDC Placement Officer",
        result: "selected", rating: 4 + (aadhaarIdx % 2),
        notes: "Trade knowledge confirmed; communication adequate for the role.",
      } as any);

      const placed = c.stage === "placed";
      await db.insert(placements).values({
        applicationId: appRow.id,
        // Full country_info name, never the job's short form — the readiness
        // lookup joins on this string.
        country: job.country,
        salary: job.salary ?? null,
        status: placed ? "active" : (c.first === "Kishori" ? "accepted" : "offered"),
        candidateResponse: placed || c.first === "Kishori" ? "accepted" : null,
        visaStatus: placed ? "approved" : "not_applied",
        startDate: placed ? daysFromNow(-(20 + aadhaarIdx * 12)) : null,
        offerExpiresAt: placed ? daysFromNow(-30) : daysFromNow(14),
      } as any);

      if (placed) {
        await db.update(candidates).set({
          pccStatus: "submitted", medicalStatus: "fit", medicalDate: daysFromNow(-40).toISOString().slice(0, 10),
          pdoCompleted: true, pdoDate: daysFromNow(-25).toISOString().slice(0, 10),
          pbbyInsuranceStatus: "enrolled", pbbyPolicyNumber: `PBBY/2026/HP/00${1000 + aadhaarIdx}`,
        } as any).where(eq(candidates.id, cand.id));
      }

      // Documents: only selected/placed owe anything — that IS the 20,000:500
      // rule. Placed candidates are complete; selected ones deliberately have
      // gaps so the documents screen shows a realistic mix.
      const base = ["identity_proof", "passport", "educational_certificate", "experience_certificate"];
      const uploaded = placed
        ? [...base, "police_clearance", "medical_certificate", "offer_letter"]
        : c.first === "Kishori"
          ? [...base, "police_clearance", "medical_certificate"]
          : base.slice(0, 3);
      for (const t of uploaded) {
        await db.insert(documents).values({
          candidateId: cand.id, type: t, fileName: `${username}-${t}.pdf`,
          fileUrl: `/uploads/hs/candidates/docs/${username}-${t}.pdf`,
          fileSize: 280000 + (aadhaarIdx * 1300), verified: placed,
        } as any);
      }
    }

    summary[c.stage] = (summary[c.stage] ?? 0) + 1;
  }

  // demo_candidate: deliberately EMPTY so signing in lands on the fresh
  // 4-page form. That walkthrough is the UAT-05 item 2/3 demo, and it is the
  // path most likely to surface bugs.
  const [demoUser] = await db.select().from(users).where(eq(users.username, "demo_candidate")).limit(1);
  if (demoUser) {
    await db.insert(candidates).values({
      userId: demoUser.id, fullName: "Demo Candidate", email: demoUser.email,
      profileComplete: false,
    } as any);
    await db.update(users).set({ emailVerified: true, emailVerifiedAt: new Date() }).where(eq(users.id, demoUser.id));
  }

  console.log("\n  cast seeded:", JSON.stringify(summary));
  console.log("  demo_candidate: empty profile (registration walkthrough)\n");
  process.exit(0);
}

main().catch((e) => { console.error("SEED FAILED:", e); process.exit(1); });
