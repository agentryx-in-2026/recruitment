import "dotenv/config";
import { storage } from "../server/storage";
import {
  users, candidates, jobs, applications, recruitmentAgents, employers,
  candidateEducation, candidateExperience, candidateLanguages, documents, savedJobs,
  recruitmentDrives, driveRegistrations, interviews, placements, notifications, agencyReviews,
  grievances, grievanceComments, faq, announcements, agencyDocuments, employerDocuments, auditLog,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

/**
 * Curated DEMO seed for HireStream — a controlled cast where every persona maps
 * to a distinct pipeline stage / feature, so a live demo lights up every screen.
 * 10 candidates (6M/4F) · 4 agencies (2 approved + 2 pending) · 4 employers
 * (2 approved + 2 pending). See shared/demo-cast.ts (the roster used by the Demo
 * Panel) — usernames here MUST match it. All passwords: test123.
 *
 * DESTRUCTIVE: TRUNCATE … CASCADE then rebuild. Back up the DB first.
 */
const D = 86_400_000;
const past = (days: number) => new Date(Date.now() - days * D);
const future = (days: number) => new Date(Date.now() + days * D);
const ymd = (dt: Date) => dt.toISOString().slice(0, 10);

async function seed() {
  console.log("Seeding HireStream curated demo data…\n");
  if (!storage.db) throw new Error("No database connection.");
  const db = storage.db;

  // security 2026-07-07 (A02-1): this DESTRUCTIVE demo seed ships weak, known
  // passwords (test123 / the superadmin default). That is fine for dev/UAT but
  // must NEVER run against the real Government production DB. Two guards:
  //  1. In production, refuse to run unless ALLOW_DEMO_SEED=true is set
  //     explicitly (prevents an accidental reseed wiping prod + planting
  //     known credentials).
  //  2. The superadmin password comes from SEED_SUPERADMIN_PASSWORD when set;
  //     in production the env var is REQUIRED (no weak default is planted).
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to run the destructive demo seed in production. " +
      "Set ALLOW_DEMO_SEED=true only on a demo/UAT box, never on the real deployment.",
    );
  }
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD
    || (isProd ? null : "hpsedc@super2026");
  if (!superadminPassword) {
    throw new Error("SEED_SUPERADMIN_PASSWORD must be set to seed the superadmin in production.");
  }

  // ── USERS ────────────────────────────────────────────────────────────
  const accounts = [
    // defaults kept so role-based quick login + tests still resolve
    { username: "demo_candidate", email: "demo_candidate@hirestream.dev", role: "candidate", password: "test123" },
    { username: "demo_agent",     email: "demo_agent@hirestream.dev",     role: "agent",     password: "test123" },
    { username: "demo_employer",  email: "demo_employer@hirestream.dev",  role: "employer",  password: "test123" },
    { username: "demo_admin",     email: "demo_admin@hirestream.dev",     role: "admin",     password: "test123" },
    { username: "superadmin",     email: "superadmin@hirestream.dev",     role: "superadmin", password: superadminPassword },
    // 10 curated candidates
    { username: "arjun_thakur",  email: "arjun.thakur@hirestream.dev",  role: "candidate", password: "test123" },
    { username: "priya_verma",   email: "priya.verma@hirestream.dev",   role: "candidate", password: "test123" },
    { username: "rohit_sharma",  email: "rohit.sharma@hirestream.dev",  role: "candidate", password: "test123" },
    { username: "neha_chauhan",  email: "neha.chauhan@hirestream.dev",  role: "candidate", password: "test123" },
    { username: "karan_rana",    email: "karan.rana@hirestream.dev",    role: "candidate", password: "test123" },
    { username: "meera_iyer",    email: "meera.iyer@hirestream.dev",    role: "candidate", password: "test123" },
    { username: "vikram_negi",   email: "vikram.negi@hirestream.dev",   role: "candidate", password: "test123" },
    { username: "ananya_bhatt",  email: "ananya.bhatt@hirestream.dev",  role: "candidate", password: "test123" },
    { username: "aman_kapoor",   email: "aman.kapoor@hirestream.dev",   role: "candidate", password: "test123" },
    { username: "sahil_verma",   email: "sahil.verma@hirestream.dev",   role: "candidate", password: "test123" },
    // 4 agencies (2 approved + 2 pending)
    { username: "europe_careers",     email: "contact@europecareers.in",        role: "agent", password: "test123" },
    { username: "gulf_jobs_direct",   email: "contact@gulfjobsdirect.in",       role: "agent", password: "test123" },
    { username: "himalayan_overseas", email: "contact@himalayanoverseas.in",    role: "agent", password: "test123" },
    { username: "pioneer_manpower",   email: "contact@pioneermanpower.in",      role: "agent", password: "test123" },
    // 4 employers (2 approved + 2 pending)
    { username: "almansoori_uae",  email: "hr@almansoori-cc.ae",       role: "employer", password: "test123" },
    { username: "sakura_care",     email: "recruitment@sakuracare.jp", role: "employer", password: "test123" },
    { username: "gulf_premier",    email: "hr@gulfpremier.qa",         role: "employer", password: "test123" },
    { username: "nippon_labour",   email: "hr@nipponlabour.jp",        role: "employer", password: "test123" },
    // +6 agencies (→ 10 total: 7 approved + 3 pending)
    { username: "himachal_manpower",     email: "contact@himachalmanpower.in",   role: "agent", password: "test123" },
    { username: "shivalik_overseas",     email: "contact@shivalikoverseas.in",   role: "agent", password: "test123" },
    { username: "dhauladhar_staffing",   email: "contact@dhauladharstaffing.in", role: "agent", password: "test123" },
    { username: "apex_global_hr",        email: "contact@apexglobalhr.in",       role: "agent", password: "test123" },
    { username: "summit_overseas",       email: "contact@summitoverseas.in",     role: "agent", password: "test123" },
    { username: "greenvalley_recruiters",email: "contact@greenvalleyrec.in",     role: "agent", password: "test123" },
    // +6 employers (→ 10 total: 7 approved + 3 pending)
    { username: "emirates_facilities", email: "hr@emiratesfm.ae",      role: "employer", password: "test123" },
    { username: "doha_hospitality",    email: "hr@dohahospitality.qa", role: "employer", password: "test123" },
    { username: "riyadh_petrotech",    email: "hr@riyadhpetrotech.sa", role: "employer", password: "test123" },
    { username: "bavaria_klinik",      email: "hr@bavariaklinik.de",   role: "employer", password: "test123" },
    { username: "kuwait_build",        email: "hr@kuwaitbuild.kw",     role: "employer", password: "test123" },
    { username: "muscat_marine",       email: "hr@muscatmarine.om",    role: "employer", password: "test123" },
    // +15 background candidates (volume — no photos/docs, shown as initials)
    ...["deepak_sharma","ravi_kumar","sandeep_singh","manish_negi","anil_thakur","pooja_rana","kavita_sharma","sunita_devi","rahul_verma","gaurav_chauhan","nitin_kapoor","ajay_rana","sneha_thakur","divya_negi","mohit_sharma"].map((un) => ({ username: un, email: `${un}@hirestream.dev`, role: "candidate", password: "test123" })),
  ];
  const uid: Record<string, string> = {};
  for (const acc of accounts) {
    const existing = await db.select().from(users).where(eq(users.username, acc.username)).limit(1);
    const hashed = await bcrypt.hash(acc.password, 10);
    if (existing.length > 0) {
      await db.update(users).set({ password: hashed, role: acc.role, email: acc.email }).where(eq(users.username, acc.username));
      uid[acc.username] = existing[0].id;
    } else {
      const [u] = await db.insert(users).values({ username: acc.username, email: acc.email, password: hashed, role: acc.role }).returning();
      uid[acc.username] = u.id;
    }
  }
  console.log(`Users: ${Object.keys(uid).length}`);

  // ── CLEAN SLATE (users preserved) ────────────────────────────────────
  await db.execute(sql`TRUNCATE TABLE
    candidates, recruitment_agents, employers, jobs, applications,
    notifications, grievances, recruitment_drives, saved_jobs,
    saved_searches, saved_segments, agency_reviews, documents,
    candidate_education, candidate_experience, candidate_references,
    candidate_agent_tags, agency_documents, employer_documents,
    application_notes, interviews, placements, training_events,
    faq, announcements, audit_log, password_reset_tokens
    RESTART IDENTITY CASCADE`);

  // Purge legacy/junk user accounts — keep ONLY the curated cast. Their profile
  // rows + audit + tokens were already cleared above, so the FK graph is clean.
  const keepUsernames = accounts.map((a) => a.username);
  await db.execute(sql`DELETE FROM users WHERE username NOT IN (${sql.join(keepUsernames.map((u) => sql`${u}`), sql`, `)})`);
  const remaining = await db.select({ id: users.id }).from(users);
  console.log(`Purged junk users → ${remaining.length} users remain (curated cast only)`);

  const email = (un: string) => accounts.find((a) => a.username === un)!.email;

  // ── CANDIDATES (10, fully populated) ─────────────────────────────────
  type Cand = {
    un: string; name: string; sex: "M" | "F"; phone: string; dob: string;
    city: string; addr: string; pin: string; father: string; mother: string;
    exp: number; skills: string[]; pref: string[]; cats: string[]; qual: string;
    passport: string; passportExp: string; ecr: "ecr" | "ecnr"; ielts?: string;
    pcc: string; medical: string; pdo: boolean; pbby: string; pbbyPolicy?: string;
  };
  const CANDS: Cand[] = [
    { un: "arjun_thakur", name: "Arjun Thakur", sex: "M", phone: "+91-98160-21455", dob: "1996-03-12", city: "Shimla", addr: "Vill. Mashobra, Tehsil Shimla", pin: "171007", father: "Rajesh Thakur", mother: "Sunita Devi", exp: 7, skills: ["Shuttering Carpentry", "Concrete Formwork", "Steel Fixing", "Site Safety"], pref: ["UAE", "Qatar", "Saudi Arabia"], cats: ["construction"], qual: "school", passport: "P4521889", passportExp: ymd(future(1750)), ecr: "ecr", pcc: "submitted", medical: "fit", pdo: true, pbby: "enrolled", pbbyPolicy: "PBBY/2026/HP/004512" },
    { un: "priya_verma", name: "Priya Verma", sex: "F", phone: "+91-98100-22110", dob: "1997-07-08", city: "Manali", addr: "Ward 4, Aleo, Manali", pin: "175131", father: "Suresh Verma", mother: "Kamla Verma", exp: 5, skills: ["ICU Care", "ACLS", "Patient Management", "IV Therapy", "German B1"], pref: ["Germany", "UK", "Ireland"], cats: ["healthcare"], qual: "bachelor", passport: "P6620145", passportExp: ymd(future(1500)), ecr: "ecnr", ielts: "7.0", pcc: "submitted", medical: "fit", pdo: true, pbby: "enrolled", pbbyPolicy: "PBBY/2026/HP/004498" },
    { un: "rohit_sharma", name: "Rohit Sharma", sex: "M", phone: "+91-94180-77321", dob: "1995-11-20", city: "Mandi", addr: "Mohalla Samkhetar, Mandi", pin: "175001", father: "Pawan Sharma", mother: "Reena Sharma", exp: 8, skills: ["Hotel Operations", "Guest Relations", "F&B Service", "Front Office"], pref: ["Qatar", "UAE", "Maldives"], cats: ["hospitality"], qual: "diploma", passport: "N7733012", passportExp: ymd(future(150)), ecr: "ecr", pcc: "submitted", medical: "fit", pdo: false, pbby: "enrolled", pbbyPolicy: "PBBY/2026/HP/004388" },
    { un: "neha_chauhan", name: "Neha Chauhan", sex: "F", phone: "+91-94590-66102", dob: "1998-02-14", city: "Bilaspur", addr: "Near Bus Stand, Bilaspur", pin: "174001", father: "Mohan Chauhan", mother: "Asha Chauhan", exp: 4, skills: ["Housekeeping", "Laundry Operations", "Hospitality Hygiene"], pref: ["Bahrain", "UAE", "Oman"], cats: ["hospitality"], qual: "school", passport: "P8810337", passportExp: ymd(future(900)), ecr: "ecr", pcc: "pending", medical: "fit", pdo: false, pbby: "pending" },
    { un: "karan_rana", name: "Karan Rana", sex: "M", phone: "+91-98170-45611", dob: "1994-09-05", city: "Una", addr: "Mehatpur, Una", pin: "174303", father: "Devinder Rana", mother: "Sarla Rana", exp: 9, skills: ["Heavy Vehicle Driving", "GCC License", "Defensive Driving", "Vehicle Maintenance"], pref: ["UAE", "Saudi Arabia", "Kuwait"], cats: ["transport"], qual: "school", passport: "P5512908", passportExp: ymd(future(1200)), ecr: "ecr", pcc: "submitted", medical: "fit", pdo: true, pbby: "pending" },
    { un: "meera_iyer", name: "Meera Iyer", sex: "F", phone: "+91-94700-88121", dob: "1999-05-22", city: "Solan", addr: "Rajgarh Road, Solan", pin: "173212", father: "Anand Iyer", mother: "Lakshmi Iyer", exp: 3, skills: ["Elder Care", "Patient Assistance", "Japanese N4", "First Aid"], pref: ["Japan", "Germany"], cats: ["healthcare"], qual: "diploma", passport: "P9021764", passportExp: ymd(future(1340)), ecr: "ecnr", ielts: "6.0", pcc: "pending", medical: "fit", pdo: false, pbby: "not_required" },
    { un: "vikram_negi", name: "Vikram Negi", sex: "M", phone: "+91-97800-33451", dob: "1993-12-01", city: "Kullu", addr: "Akhara Bazaar, Kullu", pin: "175101", father: "Tej Singh Negi", mother: "Bimla Negi", exp: 10, skills: ["MIG Welding", "TIG Welding", "Arc Welding", "Blueprint Reading", "HSE"], pref: ["Saudi Arabia", "UAE", "Oman"], cats: ["construction"], qual: "diploma", passport: "P4408821", passportExp: ymd(future(1600)), ecr: "ecr", pcc: "submitted", medical: "fit", pdo: false, pbby: "not_required" },
    { un: "ananya_bhatt", name: "Ananya Bhatt", sex: "F", phone: "+91-99123-77880", dob: "1998-08-30", city: "Chamba", addr: "Hospital Road, Chamba", pin: "176310", father: "Naresh Bhatt", mother: "Pooja Bhatt", exp: 4, skills: ["IT Support", "Networking", "Windows Server", "Ticketing", "English C1"], pref: ["Germany", "UAE", "Singapore"], cats: ["it"], qual: "bachelor", passport: "P7719450", passportExp: ymd(future(1450)), ecr: "ecnr", ielts: "6.5", pcc: "not_required", medical: "fit", pdo: false, pbby: "not_required" },
    { un: "aman_kapoor", name: "Aman Kapoor", sex: "M", phone: "+91-98050-11277", dob: "1996-06-18", city: "Hamirpur", addr: "Gandhi Chowk, Hamirpur", pin: "177001", father: "Vijay Kapoor", mother: "Nisha Kapoor", exp: 6, skills: ["Plumbing", "Pipe Fitting", "Sanitary Installation", "Maintenance"], pref: ["Kuwait", "UAE", "Qatar"], cats: ["construction"], qual: "school", passport: "P6604219", passportExp: ymd(future(1100)), ecr: "ecr", pcc: "pending", medical: "pending", pdo: false, pbby: "not_required" },
    { un: "sahil_verma", name: "Sahil Verma", sex: "M", phone: "+91-94181-90043", dob: "1997-01-25", city: "Kangra", addr: "Dharamshala Road, Kangra", pin: "176001", father: "Ramesh Verma", mother: "Geeta Verma", exp: 5, skills: ["Electrical Wiring", "Panel Installation", "Troubleshooting", "Safety Compliance"], pref: ["Oman", "UAE", "Bahrain"], cats: ["construction"], qual: "diploma", passport: "P5590338", passportExp: ymd(future(1250)), ecr: "ecr", pcc: "not_required", medical: "fit", pdo: false, pbby: "not_required" },
  ];

  const cid: Record<string, string> = {};
  for (const c of CANDS) {
    const [row] = await db.insert(candidates).values({
      userId: uid[c.un], fullName: c.name, email: email(c.un), phone: c.phone,
      location: `${c.city}, Himachal Pradesh`, experience: c.exp, experienceMonths: c.exp * 12, skills: c.skills,
      preferredCountries: c.pref, profileComplete: c.un !== "meera_iyer",
      photoUrl: `/uploads/hs/candidates/photos/${c.un}.jpg?v=2`,
      sex: c.sex === "M" ? "male" : "female",
      fatherName: c.father, motherName: c.mother,
      addressLine1: c.addr, city: c.city, pinCode: c.pin,
      permanentAddressLine1: c.addr, permanentCity: c.city, permanentPinCode: c.pin,
      passportNumber: c.passport, passportExpiry: c.passportExp, ecrStatus: c.ecr,
      pccStatus: c.pcc, medicalStatus: c.medical, ieltsBand: c.ielts as any,
      pdoCompleted: c.pdo, pbbyInsuranceStatus: c.pbby, pbbyPolicyNumber: c.pbbyPolicy ?? null,
      qualificationLevel: c.qual, preferredCategories: c.cats, openToOutreach: true,
      // Track: professional = degree/IELTS-qualified (unlocks the skilled flow —
      // Germany/UK/etc.); everyone else is standard (blue-collar). Without this
      // the tier stayed null and the dashboard defaulted every persona to the
      // blue-collar view + routed "Edit" into the blue-collar flow.
      registrationTier: ((c as any).ielts || c.qual === "bachelor") ? "professional" : "standard",
    }).returning();
    cid[c.un] = row.id;
  }
  // keep demo_candidate as a minimal generic profile so role-fallback login works
  const [demoCandRow] = await db.insert(candidates).values({
    userId: uid.demo_candidate, fullName: "Demo Candidate", email: email("demo_candidate"),
    location: "Shimla, Himachal Pradesh", experience: 2, experienceMonths: 24, skills: ["General"], preferredCountries: ["UAE"], profileComplete: false,
    registrationTier: "standard",
  }).returning();
  cid.demo_candidate = demoCandRow.id;

  // ── BACKGROUND CANDIDATES (volume — light profiles, initials, no docs) ─
  const BG_CANDS: { un: string; name: string; sex: "M" | "F"; city: string; exp: number; skills: string[]; pref: string[]; cat: string; qual: string; ecr: "ecr" | "ecnr" }[] = [
    { un: "deepak_sharma", name: "Deepak Sharma", sex: "M", city: "Bilaspur", exp: 5, skills: ["Masonry", "Plastering"], pref: ["UAE", "Qatar"], cat: "construction", qual: "school", ecr: "ecr" },
    { un: "ravi_kumar", name: "Ravi Kumar", sex: "M", city: "Una", exp: 6, skills: ["Pipe Fitting", "Welding"], pref: ["Saudi Arabia", "Kuwait"], cat: "construction", qual: "diploma", ecr: "ecr" },
    { un: "sandeep_singh", name: "Sandeep Singh", sex: "M", city: "Mandi", exp: 4, skills: ["Steel Fixing", "Rebar"], pref: ["Kuwait", "UAE"], cat: "construction", qual: "school", ecr: "ecr" },
    { un: "manish_negi", name: "Manish Negi", sex: "M", city: "Kullu", exp: 8, skills: ["Scaffolding", "Rigging"], pref: ["Saudi Arabia", "Qatar"], cat: "construction", qual: "diploma", ecr: "ecr" },
    { un: "anil_thakur", name: "Anil Thakur", sex: "M", city: "Shimla", exp: 7, skills: ["Crane Operation", "HSE"], pref: ["Saudi Arabia", "UAE"], cat: "construction", qual: "diploma", ecr: "ecr" },
    { un: "pooja_rana", name: "Pooja Rana", sex: "F", city: "Solan", exp: 4, skills: ["Housekeeping", "Hygiene"], pref: ["Qatar", "Bahrain"], cat: "hospitality", qual: "school", ecr: "ecr" },
    { un: "kavita_sharma", name: "Kavita Sharma", sex: "F", city: "Kangra", exp: 5, skills: ["Elder Care", "Patient Assistance"], pref: ["Germany", "Japan"], cat: "healthcare", qual: "diploma", ecr: "ecnr" },
    { un: "sunita_devi", name: "Sunita Devi", sex: "F", city: "Chamba", exp: 3, skills: ["Cleaning", "Laundry"], pref: ["UAE", "Oman"], cat: "hospitality", qual: "school", ecr: "ecr" },
    { un: "rahul_verma", name: "Rahul Verma", sex: "M", city: "Hamirpur", exp: 6, skills: ["F&B Service", "Guest Relations"], pref: ["Qatar", "UAE"], cat: "hospitality", qual: "diploma", ecr: "ecr" },
    { un: "gaurav_chauhan", name: "Gaurav Chauhan", sex: "M", city: "Bilaspur", exp: 5, skills: ["Electrical", "Maintenance"], pref: ["Saudi Arabia", "Oman"], cat: "construction", qual: "diploma", ecr: "ecr" },
    { un: "nitin_kapoor", name: "Nitin Kapoor", sex: "M", city: "Una", exp: 9, skills: ["Site Supervision", "Management"], pref: ["Kuwait", "Saudi Arabia"], cat: "construction", qual: "diploma", ecr: "ecr" },
    { un: "ajay_rana", name: "Ajay Rana", sex: "M", city: "Mandi", exp: 4, skills: ["Heavy Vehicle Driving", "GCC License"], pref: ["UAE", "Qatar"], cat: "transport", qual: "school", ecr: "ecr" },
    { un: "sneha_thakur", name: "Sneha Thakur", sex: "F", city: "Shimla", exp: 4, skills: ["Nursing", "Patient Care", "German A2"], pref: ["Germany"], cat: "healthcare", qual: "bachelor", ecr: "ecnr" },
    { un: "divya_negi", name: "Divya Negi", sex: "F", city: "Kullu", exp: 3, skills: ["IT Support", "Networking"], pref: ["Germany", "UAE"], cat: "it", qual: "bachelor", ecr: "ecnr" },
    { un: "mohit_sharma", name: "Mohit Sharma", sex: "M", city: "Solan", exp: 6, skills: ["Cooking", "Food Safety"], pref: ["UAE", "Qatar"], cat: "hospitality", qual: "diploma", ecr: "ecr" },
  ];
  for (let i = 0; i < BG_CANDS.length; i++) {
    const c = BG_CANDS[i];
    const [row] = await db.insert(candidates).values({
      userId: uid[c.un], fullName: c.name, email: email(c.un),
      location: `${c.city}, Himachal Pradesh`, experience: c.exp, experienceMonths: c.exp * 12, skills: c.skills,
      preferredCountries: c.pref, preferredCategories: [c.cat], qualificationLevel: c.qual,
      registrationTier: c.qual === "bachelor" ? "professional" : "standard",
      sex: c.sex === "M" ? "male" : "female",
      passportNumber: `P${6700001 + i}`, ecrStatus: c.ecr, profileComplete: true, openToOutreach: true,
    }).returning();
    cid[c.un] = row.id;
    // UAT-03 #5 (2026-07-16): `type` was never set here, so every seeded row had
    // type=null — which silently defeated the duplicate check on
    // POST /candidates/education (it required type AND degree to match, and
    // null never matched the type the wizard sends). Degrees also use the
    // canonical EDUCATION_OPTIONS vocabulary now so the seed stops inventing
    // spellings the picker can't produce.
    const eduByQual = {
      bachelor: { type: "university", degree: "B.A." },
      diploma:  { type: "diploma",    degree: "Polytechnic Diploma" },
    } as const;
    const edu = (eduByQual as any)[c.qual] ?? { type: "school", degree: "12th (Senior Secondary)" };
    await db.insert(candidateEducation).values({ candidateId: row.id, type: edu.type, degree: edu.degree, institution: `Govt. Institute, ${c.city}`, year: 2015, percentage: "70.0" as any });
    await db.insert(candidateExperience).values({ candidateId: row.id, company: "Local Employer", role: c.skills[0], years: c.exp, country: "India" });
  }
  console.log(`Candidates: ${Object.keys(cid).length} (10 hero + ${BG_CANDS.length} background + demo)`);

  // ── LANGUAGES (UAT-03 Item 12) — Hindi native + English for every candidate;
  //    a couple get an extra destination-relevant language for demo variety.
  let langCount = 0;
  for (const id of Object.values(cid)) {
    await db.insert(candidateLanguages).values([
      { candidateId: id, language: "Hindi", proficiency: "native", canRead: true, canWrite: true, canSpeak: true },
      { candidateId: id, language: "English", proficiency: "intermediate", canRead: true, canWrite: true, canSpeak: true },
    ]).onConflictDoNothing();
    langCount += 2;
  }
  // A few Gulf-bound candidates pick up basic Arabic.
  for (const un of ["arjun_thakur", "vikram_negi", "deepak_sharma"]) {
    if (cid[un]) { await db.insert(candidateLanguages).values({ candidateId: cid[un], language: "Arabic", proficiency: "elementary", canSpeak: true }).onConflictDoNothing(); langCount++; }
  }
  console.log(`Languages: ${langCount} seeded`);

  // ── EDUCATION + EXPERIENCE ───────────────────────────────────────────
  const edu: any[] = [];
  const exp: any[] = [];
  const addEdu = (un: string, rows: { degree: string; institution: string; year: number; pct: string }[]) =>
    rows.forEach((r) => edu.push({ candidateId: cid[un], degree: r.degree, institution: r.institution, year: r.year, percentage: r.pct as any }));
  const addExp = (un: string, rows: { company: string; role: string; years: number; country?: string; description?: string }[]) =>
    rows.forEach((r) => exp.push({ candidateId: cid[un], company: r.company, role: r.role, years: r.years, country: r.country ?? "India", description: r.description }));

  addEdu("arjun_thakur", [{ degree: "ITI — Construction (Carpentry)", institution: "ITI Shimla", year: 2014, pct: "74.0" }, { degree: "10th (Matriculation)", institution: "Govt. Sr. Sec. School, Mashobra", year: 2012, pct: "68.5" }]);
  addEdu("priya_verma", [{ degree: "B.Sc Nursing", institution: "IGMC Shimla", year: 2019, pct: "84.0" }, { degree: "12th (Medical)", institution: "DAV Manali", year: 2015, pct: "82.6" }]);
  addEdu("rohit_sharma", [{ degree: "Diploma in Hotel Management", institution: "IHM Hamirpur", year: 2016, pct: "76.2" }, { degree: "12th (Commerce)", institution: "Govt. School, Mandi", year: 2013, pct: "71.0" }]);
  addEdu("neha_chauhan", [{ degree: "12th (Arts)", institution: "Govt. Girls School, Bilaspur", year: 2016, pct: "65.4" }, { degree: "10th", institution: "Govt. School, Bilaspur", year: 2014, pct: "62.0" }]);
  addEdu("karan_rana", [{ degree: "10th (Matriculation)", institution: "Govt. School, Mehatpur", year: 2011, pct: "60.8" }]);
  addEdu("meera_iyer", [{ degree: "Diploma in Geriatric Care", institution: "HP Paramedical Council, Solan", year: 2020, pct: "79.5" }, { degree: "12th (Science)", institution: "St. Luke's, Solan", year: 2017, pct: "80.1" }]);
  addEdu("vikram_negi", [{ degree: "ITI — Welder", institution: "ITI Kullu", year: 2012, pct: "77.3" }, { degree: "10th", institution: "Govt. School, Kullu", year: 2009, pct: "66.0" }]);
  addEdu("ananya_bhatt", [{ degree: "BCA (Computer Applications)", institution: "Govt. College Chamba", year: 2020, pct: "81.7" }, { degree: "12th (Science)", institution: "DAV Chamba", year: 2016, pct: "78.2" }]);
  addEdu("aman_kapoor", [{ degree: "ITI — Plumber", institution: "ITI Hamirpur", year: 2015, pct: "72.9" }, { degree: "10th", institution: "Govt. School, Hamirpur", year: 2013, pct: "64.5" }]);
  addEdu("sahil_verma", [{ degree: "ITI — Electrician", institution: "ITI Kangra", year: 2016, pct: "75.6" }, { degree: "12th", institution: "Govt. School, Kangra", year: 2014, pct: "69.8" }]);

  addExp("arjun_thakur", [{ company: "Shapoorji Pallonji", role: "Shuttering Carpenter", years: 4, description: "Formwork on high-rise residential towers." }, { company: "Local Contractor, Shimla", role: "Construction Worker", years: 3 }]);
  addExp("priya_verma", [{ company: "IGMC Shimla", role: "Staff Nurse — ICU", years: 3 }, { company: "Fortis Kangra", role: "Junior Nurse", years: 2 }]);
  addExp("rohit_sharma", [{ company: "The Oberoi Cecil, Shimla", role: "Front Office Executive", years: 5 }, { company: "Hotel Holiday Home", role: "Guest Service Associate", years: 3 }]);
  addExp("neha_chauhan", [{ company: "Radisson Blu, Shimla", role: "Housekeeping Attendant", years: 4 }]);
  addExp("karan_rana", [{ company: "HRTC", role: "Heavy Vehicle Driver", years: 6 }, { company: "Private Transport, Una", role: "Driver", years: 3 }]);
  addExp("meera_iyer", [{ company: "Solan Care Home", role: "Geriatric Caregiver", years: 3 }]);
  addExp("vikram_negi", [{ company: "L&T Heavy Engineering", role: "Welder (TIG/MIG)", years: 6 }, { company: "Local Fabrication, Kullu", role: "Welder", years: 4 }]);
  addExp("ananya_bhatt", [{ company: "HCL Technologies", role: "IT Support Engineer", years: 4 }]);
  addExp("aman_kapoor", [{ company: "Mahindra Lifespaces", role: "Plumber", years: 6 }]);
  addExp("sahil_verma", [{ company: "Tata Projects", role: "Electrician", years: 5 }]);
  await db.insert(candidateEducation).values(edu);
  await db.insert(candidateExperience).values(exp);
  console.log(`Education: ${edu.length} · Experience: ${exp.length}`);

  // ── CANDIDATE DOCUMENTS (Meera missing passport → 1 gap) ─────────────
  const docRows: any[] = [];
  const dpath = (un: string, kind: string, ext = "pdf") => `/uploads/hs/candidates/docs/${un}-${kind}.${ext}`;
  for (const c of CANDS) {
    docRows.push({ candidateId: cid[c.un], type: "cv", fileName: `${c.un}-cv.pdf`, fileUrl: dpath(c.un, "cv"), fileSize: 220000, verified: true });
    if (c.un !== "meera_iyer")
      docRows.push({ candidateId: cid[c.un], type: "passport", fileName: `${c.un}-passport.pdf`, fileUrl: dpath(c.un, "passport"), fileSize: 480000, verified: true });
    docRows.push({ candidateId: cid[c.un], type: "identity_proof", fileName: `${c.un}-aadhaar.pdf`, fileUrl: dpath(c.un, "aadhaar"), fileSize: 300000, verified: c.un !== "aman_kapoor" });
    docRows.push({ candidateId: cid[c.un], type: "educational_certificate", fileName: `${c.un}-education.pdf`, fileUrl: dpath(c.un, "education"), fileSize: 260000, verified: true });
  }
  await db.insert(documents).values(docRows);
  console.log(`Candidate documents: ${docRows.length}`);

  // ── AGENCIES (2 approved + 2 pending) ────────────────────────────────
  const [europeCareers] = await db.insert(recruitmentAgents).values({
    userId: uid.europe_careers, agencyName: "Europe Careers Pvt. Ltd.", licenseNumber: "B-0345/HP/PER/1000+/5/2020/3210",
    specializations: ["Healthcare", "IT", "Engineering"], verified: true, rating: 5, placements: 174,
    contactEmail: email("europe_careers"), contactPhone: "+91-177-2620345", registeredCity: "Shimla", registeredState: "Himachal Pradesh", registeredPinCode: "171001",
    authorisedSignatoryName: "Anita Sood", authorisedSignatoryDesignation: "Managing Director", meaLicenseExpiry: ymd(future(900)) as any, verifiedAt: past(420), verifiedBy: uid.demo_admin,
  }).returning();
  const [gulfDirect] = await db.insert(recruitmentAgents).values({
    userId: uid.gulf_jobs_direct, agencyName: "Gulf Jobs Direct", licenseNumber: "B-0267/HP/PER/1000+/5/2019/2811",
    specializations: ["Construction", "Hospitality", "Oil & Gas"], verified: true, rating: 5, placements: 196,
    contactEmail: email("gulf_jobs_direct"), contactPhone: "+91-1894-242267", registeredCity: "Dharamshala", registeredState: "Himachal Pradesh", registeredPinCode: "176215",
    authorisedSignatoryName: "Imran Qureshi", authorisedSignatoryDesignation: "Director", meaLicenseExpiry: ymd(future(700)) as any, verifiedAt: past(300), verifiedBy: uid.demo_admin,
  }).returning();
  const [himalayan] = await db.insert(recruitmentAgents).values({
    userId: uid.himalayan_overseas, agencyName: "Himalayan Overseas Consultants", licenseNumber: "B-0512/HP/PER/1000+/5/2026/4471",
    specializations: ["Construction", "Hospitality", "Healthcare"], verified: false, rating: 0, placements: 0,
    contactEmail: email("himalayan_overseas"), contactPhone: "+91-177-2655512", registeredCity: "Shimla", registeredState: "Himachal Pradesh", registeredPinCode: "171004",
    authorisedSignatoryName: "Rakesh Sharma", authorisedSignatoryDesignation: "Proprietor", meaLicenseExpiry: ymd(future(1000)) as any, submittedForReviewAt: past(3),
  }).returning();
  const [pioneer] = await db.insert(recruitmentAgents).values({
    userId: uid.pioneer_manpower, agencyName: "Pioneer Manpower Services", licenseNumber: "B-0518/HP/PER/1000+/5/2026/4490",
    specializations: ["Construction", "Manufacturing"], verified: false, rating: 0, placements: 0,
    contactEmail: email("pioneer_manpower"), contactPhone: "+91-1905-223518", registeredCity: "Mandi", registeredState: "Himachal Pradesh", registeredPinCode: "175001",
    authorisedSignatoryName: "Sunil Kumar", authorisedSignatoryDesignation: "Director", meaLicenseExpiry: ymd(future(1000)) as any, submittedForReviewAt: past(1),
  }).returning();
  console.log("Agencies: 4 (2 approved, 2 pending)");

  // MEA 9-doc set for each agency (approved → approved status, pending → pending)
  const MEA_DOCS = [
    "mea_recruiting_licence", "incorporation_certificate", "pan_card", "gst_certificate",
    "office_address_proof", "authorised_signatory_id", "labour_recruitment_permission",
    "past_placement_experience", "hpsedc_undertaking",
  ];
  const agencyDocRows: any[] = [];
  const pushAgencyDocs = (agencyId: string, slug: string, status: "approved" | "pending") =>
    MEA_DOCS.forEach((t) => agencyDocRows.push({ agencyId, type: t, fileName: `${slug}-${t}.pdf`, fileUrl: `/uploads/hs/agencies/${slug}/${t}.pdf`, fileSize: 320000, status }));
  pushAgencyDocs(europeCareers.id, "europe_careers", "approved");
  pushAgencyDocs(gulfDirect.id, "gulf_jobs_direct", "approved");
  pushAgencyDocs(himalayan.id, "himalayan_overseas", "pending");
  pushAgencyDocs(pioneer.id, "pioneer_manpower", "pending");
  // +6 agencies (→ 10 total: 7 approved + 3 pending). shivalik = a top performer.
  const EXTRA_AGENCIES = [
    { un: "shivalik_overseas", name: "Shivalik Overseas Recruiters", lic: "B-0402/HP/PER/1000+/5/2022/3711", specs: ["Oil & Gas", "Construction", "Trades"], verified: true, city: "Bilaspur", sig: "Rakesh Verma", desig: "Proprietor", rating: 5, placements: 150 },
    { un: "himachal_manpower", name: "Himachal Manpower Exports", lic: "B-0381/HP/PER/1000+/5/2021/3502", specs: ["Construction", "Hospitality"], verified: true, city: "Solan", sig: "Naresh Kumar", desig: "Director", rating: 4, placements: 96 },
    { un: "dhauladhar_staffing", name: "Dhauladhar Staffing Solutions", lic: "B-0419/HP/PER/1000+/5/2022/3840", specs: ["Healthcare", "Hospitality"], verified: true, city: "Kangra", sig: "Sunita Sharma", desig: "Managing Director", rating: 4, placements: 78 },
    { un: "apex_global_hr", name: "Apex Global HR Consultants", lic: "B-0455/HP/PER/1000+/5/2023/4022", specs: ["IT", "Engineering"], verified: true, city: "Shimla", sig: "Vivek Anand", desig: "CEO", rating: 4, placements: 61 },
    { un: "summit_overseas", name: "Summit Overseas Placements", lic: "B-0478/HP/PER/1000+/5/2024/4188", specs: ["Hospitality", "Construction"], verified: true, city: "Mandi", sig: "Pankaj Thakur", desig: "Director", rating: 3, placements: 39 },
    { un: "greenvalley_recruiters", name: "Green Valley Recruiters", lic: "B-0520/HP/PER/1000+/5/2026/4502", specs: ["Construction", "Transport"], verified: false, city: "Una", sig: "Deepak Rana", desig: "Proprietor", rating: 0, placements: 0 },
  ];
  for (const a of EXTRA_AGENCIES) {
    const [row] = await db.insert(recruitmentAgents).values({
      userId: uid[a.un], agencyName: a.name, licenseNumber: a.lic, specializations: a.specs,
      verified: a.verified, rating: a.rating, placements: a.placements,
      contactEmail: email(a.un), registeredCity: a.city, registeredState: "Himachal Pradesh",
      authorisedSignatoryName: a.sig, authorisedSignatoryDesignation: a.desig, meaLicenseExpiry: ymd(future(800)) as any,
      ...(a.verified ? { verifiedAt: past(180), verifiedBy: uid.demo_admin } : { submittedForReviewAt: past(2) }),
    }).returning();
    pushAgencyDocs(row.id, a.un, a.verified ? "approved" : "pending");
  }
  await db.insert(agencyDocuments).values(agencyDocRows);
  console.log(`Agencies: 10 (7 approved, 3 pending) · documents: ${agencyDocRows.length}`);

  // ── EMPLOYERS (2 approved + 2 pending) ───────────────────────────────
  const [almansoori] = await db.insert(employers).values({
    userId: uid.almansoori_uae, companyName: "Al-Mansoori Construction & Contracting LLC", industry: "Construction", location: "Dubai, UAE",
    registeredCountry: "United Arab Emirates", verified: true, activeJobs: 6, contactEmail: email("almansoori_uae"), contactPhone: "+971-4-3215566",
    authorisedSignatoryName: "Khalid Al-Mansoori", authorisedSignatoryDesignation: "HR Director", authorisedSignatoryIdType: "passport", authorisedSignatoryIdNumber: "UAE-PA-2231908", verifiedAt: past(260), verifiedBy: uid.demo_admin,
  }).returning();
  const [sakura] = await db.insert(employers).values({
    userId: uid.sakura_care, companyName: "Sakura Care & Staffing Group", industry: "Healthcare & Hospitality", location: "Osaka, Japan",
    registeredCountry: "Japan", verified: true, activeJobs: 4, contactEmail: email("sakura_care"), contactPhone: "+81-6-6271-0099",
    authorisedSignatoryName: "Kenji Tanaka", authorisedSignatoryDesignation: "Recruitment Manager", authorisedSignatoryIdType: "passport", authorisedSignatoryIdNumber: "JP-TK-5519023", verifiedAt: past(190), verifiedBy: uid.demo_admin,
  }).returning();
  const [gulfPremier] = await db.insert(employers).values({
    userId: uid.gulf_premier, companyName: "Gulf Premier Hospitality LLC", industry: "Hospitality", location: "Doha, Qatar",
    registeredCountry: "Qatar", verified: false, activeJobs: 0, contactEmail: email("gulf_premier"), contactPhone: "+974-4-4567788",
    authorisedSignatoryName: "Yusuf Al-Thani", authorisedSignatoryDesignation: "GM Talent", authorisedSignatoryIdType: "passport", authorisedSignatoryIdNumber: "QA-YT-7781203", submittedForReviewAt: past(2),
  }).returning();
  const [nippon] = await db.insert(employers).values({
    userId: uid.nippon_labour, companyName: "Nippon Skilled Labour Co.", industry: "Manufacturing & Trades", location: "Tokyo, Japan",
    registeredCountry: "Japan", verified: false, activeJobs: 0, contactEmail: email("nippon_labour"), contactPhone: "+81-3-5500-1212",
    authorisedSignatoryName: "Haruto Sato", authorisedSignatoryDesignation: "Director", authorisedSignatoryIdType: "passport", authorisedSignatoryIdNumber: "JP-HS-3390114", submittedForReviewAt: past(1),
  }).returning();
  console.log("Employers: 4 (2 approved, 2 pending)");

  // Employer 5-doc set (foreign principal)
  const EMP_DOCS = ["demand_letter", "power_of_attorney", "business_registration", "employment_contract", "signatory_passport"];
  const empDocRows: any[] = [];
  const pushEmpDocs = (employerId: string, slug: string, status: "approved" | "pending") =>
    EMP_DOCS.forEach((t) => empDocRows.push({ employerId, type: t, fileName: `${slug}-${t}.pdf`, fileUrl: `/uploads/hs/employers/${slug}/${t}.pdf`, fileSize: 340000, status }));
  pushEmpDocs(almansoori.id, "almansoori_uae", "approved");
  pushEmpDocs(sakura.id, "sakura_care", "approved");
  pushEmpDocs(gulfPremier.id, "gulf_premier", "pending");
  pushEmpDocs(nippon.id, "nippon_labour", "pending");
  // +6 employers (→ 10 total: 7 approved + 3 pending)
  const EXTRA_EMPLOYERS = [
    { un: "riyadh_petrotech", name: "Riyadh PetroTech Industries", industry: "Oil & Gas", loc: "Riyadh, Saudi Arabia", country: "Saudi Arabia", verified: true, sig: "Saleh Al-Otaibi", idNum: "SA-SO-5567102" },
    { un: "kuwait_build", name: "Kuwait National Build Co.", industry: "Construction", loc: "Kuwait City, Kuwait", country: "Kuwait", verified: true, sig: "Yousef Al-Sabah", idNum: "KW-YS-3340988" },
    { un: "emirates_facilities", name: "Emirates Facilities Management LLC", industry: "Facilities Management", loc: "Dubai, UAE", country: "United Arab Emirates", verified: true, sig: "Omar Hassan", idNum: "UAE-PA-3391045" },
    { un: "doha_hospitality", name: "Doha Hospitality Group", industry: "Hospitality", loc: "Doha, Qatar", country: "Qatar", verified: true, sig: "Fahad Al-Kuwari", idNum: "QA-FA-2218890" },
    { un: "bavaria_klinik", name: "Bavaria Klinik Verbund", industry: "Healthcare", loc: "Munich, Germany", country: "Germany", verified: true, sig: "Klaus Weber", idNum: "DE-KW-7781200" },
    { un: "muscat_marine", name: "Muscat Marine Services LLC", industry: "Marine & Trades", loc: "Muscat, Oman", country: "Oman", verified: false, sig: "Ali Al-Balushi", idNum: "OM-AB-1129004" },
  ];
  for (const e of EXTRA_EMPLOYERS) {
    const [row] = await db.insert(employers).values({
      userId: uid[e.un], companyName: e.name, industry: e.industry, location: e.loc, registeredCountry: e.country,
      verified: e.verified, activeJobs: e.verified ? 3 : 0, contactEmail: email(e.un),
      authorisedSignatoryName: e.sig, authorisedSignatoryDesignation: "Authorised Signatory", authorisedSignatoryIdType: "passport", authorisedSignatoryIdNumber: e.idNum,
      ...(e.verified ? { verifiedAt: past(150), verifiedBy: uid.demo_admin } : { submittedForReviewAt: past(1) }),
    }).returning();
    pushEmpDocs(row.id, e.un, e.verified ? "approved" : "pending");
  }
  await db.insert(employerDocuments).values(empDocRows);
  console.log(`Employers: 10 (7 approved, 3 pending) · documents: ${empDocRows.length}`);

  // ── JOBS ─────────────────────────────────────────────────────────────
  // Public derivative jobs (employer principal + sourcing agency). One requisition
  // per cast destination, plus 2 open agents_only requisitions for the pickup demo.
  type J = { key: string; title: string; company: string; location: string; country: string; category: string; qual: string; skills: string[]; salary: string; exp: number; employer: string; agent: string | null; ielts?: string; priority?: string };
  const JOBS: J[] = [
    { key: "construction_dubai", title: "Construction Worker (Shuttering Carpenter)", company: "Al-Mansoori Construction & Contracting LLC", location: "Dubai, UAE", country: "UAE", category: "construction", qual: "school", skills: ["Shuttering Carpentry", "Concrete Formwork", "Site Safety"], salary: "AED 1,800 – 2,400/mo + accommodation", exp: 3, employer: "almansoori_uae", agent: "gulf_jobs_direct", priority: "urgent" },
    { key: "driver_uae", title: "Heavy Vehicle Driver", company: "Al-Mansoori Construction & Contracting LLC", location: "Abu Dhabi, UAE", country: "UAE", category: "transport", qual: "school", skills: ["Heavy Vehicle Driving", "GCC License", "Defensive Driving"], salary: "AED 2,200 – 2,800/mo", exp: 4, employer: "almansoori_uae", agent: "gulf_jobs_direct" },
    { key: "welder_saudi", title: "Welder (TIG/MIG) — Offshore", company: "Al-Mansoori Construction & Contracting LLC", location: "Dammam, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "diploma", skills: ["MIG Welding", "TIG Welding", "Blueprint Reading", "HSE"], salary: "SAR 3,500 – 4,500/mo tax-free", exp: 5, employer: "almansoori_uae", agent: "gulf_jobs_direct", priority: "critical" },
    { key: "electrician_oman", title: "Industrial Electrician", company: "Al-Mansoori Construction & Contracting LLC", location: "Muscat, Oman", country: "Oman", category: "construction", qual: "diploma", skills: ["Electrical Wiring", "Panel Installation", "Troubleshooting"], salary: "OMR 300 – 420/mo", exp: 4, employer: "almansoori_uae", agent: "gulf_jobs_direct" },
    { key: "plumber_kuwait", title: "Plumber / Pipe Fitter", company: "Al-Mansoori Construction & Contracting LLC", location: "Kuwait City, Kuwait", country: "Kuwait", category: "construction", qual: "school", skills: ["Plumbing", "Pipe Fitting", "Sanitary Installation"], salary: "KWD 220 – 300/mo", exp: 3, employer: "almansoori_uae", agent: "gulf_jobs_direct" },
    { key: "hotel_qatar", title: "Hotel Front Office Associate", company: "Al-Mansoori Construction & Contracting LLC", location: "Doha, Qatar", country: "Qatar", category: "hospitality", qual: "diploma", skills: ["Front Office", "Guest Relations", "Hotel Operations"], salary: "QAR 3,000 – 4,000/mo + board", exp: 4, employer: "almansoori_uae", agent: "gulf_jobs_direct" },
    { key: "nurse_germany", title: "Registered Nurse — ICU", company: "Sakura Care & Staffing Group", location: "Munich, Germany", country: "Germany", category: "healthcare", qual: "bachelor", skills: ["ICU Care", "ACLS", "Patient Management", "German B1"], salary: "EUR 3,200 – 3,900/mo", exp: 2, employer: "sakura_care", agent: "europe_careers", ielts: "6.5", priority: "urgent" },
    { key: "caregiver_japan", title: "Caregiver (Elder Care) — SSW Visa", company: "Sakura Care & Staffing Group", location: "Osaka, Japan", country: "Japan", category: "healthcare", qual: "diploma", skills: ["Elder Care", "Patient Assistance", "Japanese N4"], salary: "JPY 200,000 – 250,000/mo", exp: 1, employer: "sakura_care", agent: "europe_careers" },
    { key: "it_germany", title: "IT Support Engineer", company: "Sakura Care & Staffing Group", location: "Berlin, Germany", country: "Germany", category: "it", qual: "bachelor", skills: ["IT Support", "Networking", "Windows Server"], salary: "EUR 3,000 – 3,800/mo", exp: 3, employer: "sakura_care", agent: "europe_careers", ielts: "6.0" },
    { key: "housekeeping_bahrain", title: "Housekeeping Attendant", company: "Sakura Care & Staffing Group", location: "Manama, Bahrain", country: "Bahrain", category: "hospitality", qual: "school", skills: ["Housekeeping", "Laundry Operations"], salary: "BHD 180 – 240/mo + board", exp: 2, employer: "sakura_care", agent: "europe_careers" },
    // open requisitions (agents_only, not yet picked up) — for the pickup demo
    { key: "scaffolder_uae_req", title: "Scaffolder", company: "Al-Mansoori Construction & Contracting LLC", location: "Abu Dhabi, UAE", country: "UAE", category: "construction", qual: "school", skills: ["Scaffolding", "Site Safety", "Working at Height"], salary: "AED 1,900 – 2,500/mo", exp: 3, employer: "almansoori_uae", agent: null, priority: "standard" },
    { key: "physio_germany_req", title: "Physiotherapist", company: "Sakura Care & Staffing Group", location: "Frankfurt, Germany", country: "Germany", category: "healthcare", qual: "bachelor", skills: ["Physiotherapy", "Rehabilitation", "German B1"], salary: "EUR 3,400 – 4,100/mo", exp: 2, employer: "sakura_care", agent: null, ielts: "6.5" },
  ];
  // +16 more jobs (→ 28 total). Top performers own the most: gulf_jobs_direct +4,
  // europe_careers +3, shivalik_overseas +5 → they dominate the leaderboard.
  const EXTRA_JOBS: J[] = [
    { key: "rigger_saudi", title: "Rigger", company: "Riyadh PetroTech Industries", location: "Jubail, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "diploma", skills: ["Rigging", "Slinging", "HSE"], salary: "SAR 3,000 – 3,800/mo", exp: 4, employer: "riyadh_petrotech", agent: "gulf_jobs_direct" },
    { key: "mason_kuwait", title: "Mason", company: "Kuwait National Build Co.", location: "Kuwait City, Kuwait", country: "Kuwait", category: "construction", qual: "school", skills: ["Masonry", "Plastering"], salary: "KWD 200 – 260/mo", exp: 3, employer: "kuwait_build", agent: "gulf_jobs_direct" },
    { key: "cleaner_dubai", title: "Facility Cleaner", company: "Emirates Facilities Management LLC", location: "Dubai, UAE", country: "UAE", category: "hospitality", qual: "school", skills: ["Cleaning", "Hygiene"], salary: "AED 1,400 – 1,800/mo + accommodation", exp: 1, employer: "emirates_facilities", agent: "gulf_jobs_direct" },
    { key: "waiter_qatar", title: "Waiter / F&B Steward", company: "Doha Hospitality Group", location: "Doha, Qatar", country: "Qatar", category: "hospitality", qual: "school", skills: ["F&B Service", "Guest Relations"], salary: "QAR 2,200 – 2,800/mo + board", exp: 2, employer: "doha_hospitality", agent: "gulf_jobs_direct" },
    { key: "nurse2_germany", title: "Registered Nurse — General Ward", company: "Bavaria Klinik Verbund", location: "Munich, Germany", country: "Germany", category: "healthcare", qual: "bachelor", skills: ["Nursing", "Patient Care", "German B1"], salary: "EUR 3,100 – 3,700/mo", exp: 2, employer: "bavaria_klinik", agent: "europe_careers", ielts: "6.5" },
    { key: "caregiver2_germany", title: "Geriatric Caregiver", company: "Bavaria Klinik Verbund", location: "Nuremberg, Germany", country: "Germany", category: "healthcare", qual: "diploma", skills: ["Elder Care", "German A2"], salary: "EUR 2,600 – 3,200/mo", exp: 1, employer: "bavaria_klinik", agent: "europe_careers" },
    { key: "netadmin_germany", title: "Network Administrator", company: "Bavaria Klinik Verbund", location: "Berlin, Germany", country: "Germany", category: "it", qual: "bachelor", skills: ["Networking", "Linux", "Windows Server"], salary: "EUR 3,200 – 4,000/mo", exp: 3, employer: "bavaria_klinik", agent: "europe_careers", ielts: "6.0" },
    { key: "pipefitter_saudi", title: "Pipe Fitter", company: "Riyadh PetroTech Industries", location: "Jubail, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "diploma", skills: ["Pipe Fitting", "Welding", "HSE"], salary: "SAR 3,200 – 4,000/mo", exp: 5, employer: "riyadh_petrotech", agent: "shivalik_overseas", priority: "urgent" },
    { key: "scaffolder_saudi", title: "Scaffolder", company: "Riyadh PetroTech Industries", location: "Dammam, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "school", skills: ["Scaffolding", "Working at Height"], salary: "SAR 2,800 – 3,400/mo", exp: 3, employer: "riyadh_petrotech", agent: "shivalik_overseas" },
    { key: "steelfixer_kuwait", title: "Steel Fixer", company: "Kuwait National Build Co.", location: "Kuwait City, Kuwait", country: "Kuwait", category: "construction", qual: "school", skills: ["Steel Fixing", "Rebar"], salary: "KWD 210 – 280/mo", exp: 3, employer: "kuwait_build", agent: "shivalik_overseas" },
    { key: "foreman_kuwait", title: "Site Foreman", company: "Kuwait National Build Co.", location: "Kuwait City, Kuwait", country: "Kuwait", category: "construction", qual: "diploma", skills: ["Supervision", "Site Management"], salary: "KWD 350 – 450/mo", exp: 7, employer: "kuwait_build", agent: "shivalik_overseas", priority: "critical" },
    { key: "crane_op_saudi", title: "Crane Operator", company: "Riyadh PetroTech Industries", location: "Jubail, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "diploma", skills: ["Crane Operation", "HSE"], salary: "SAR 3,500 – 4,500/mo", exp: 5, employer: "riyadh_petrotech", agent: "shivalik_overseas" },
    { key: "housekeeper_qatar", title: "Housekeeping Supervisor", company: "Doha Hospitality Group", location: "Doha, Qatar", country: "Qatar", category: "hospitality", qual: "diploma", skills: ["Housekeeping", "Supervision"], salary: "QAR 3,000 – 3,600/mo + board", exp: 4, employer: "doha_hospitality", agent: "himachal_manpower" },
    { key: "cook_dubai", title: "Commi Cook", company: "Emirates Facilities Management LLC", location: "Dubai, UAE", country: "UAE", category: "hospitality", qual: "diploma", skills: ["Cooking", "Food Safety"], salary: "AED 2,000 – 2,600/mo", exp: 3, employer: "emirates_facilities", agent: "himachal_manpower" },
    { key: "caregiver3_germany", title: "Home Caregiver", company: "Bavaria Klinik Verbund", location: "Stuttgart, Germany", country: "Germany", category: "healthcare", qual: "diploma", skills: ["Elder Care", "German A2"], salary: "EUR 2,500 – 3,100/mo", exp: 2, employer: "bavaria_klinik", agent: "dhauladhar_staffing" },
    { key: "maint_electrician_saudi", title: "Maintenance Electrician", company: "Riyadh PetroTech Industries", location: "Riyadh, Saudi Arabia", country: "Saudi Arabia", category: "construction", qual: "diploma", skills: ["Electrical", "Maintenance"], salary: "SAR 3,000 – 3,800/mo", exp: 4, employer: "riyadh_petrotech", agent: "apex_global_hr" },
  ];
  const jid: Record<string, string> = {};
  const jobCountry: Record<string, string> = {};
  const jobSalary: Record<string, string> = {};
  for (const j of [...JOBS, ...EXTRA_JOBS]) {
    const [row] = await db.insert(jobs).values({
      title: j.title, company: j.company, location: j.location, country: j.country, category: j.category,
      qualificationRequired: j.qual, skills: j.skills, salary: j.salary, experience: j.exp,
      requiredIeltsBand: (j.ielts ?? null) as any, languagesRequired: j.ielts ? { english_ielts: Number(j.ielts) } : null,
      employerId: uid[j.employer], agentId: j.agent ? uid[j.agent] : null,
      status: "active", employmentType: "full-time" as any,
      visibility: j.agent ? "public" : "agents_only", priority: j.priority ?? "standard",
      targetHires: j.priority === "critical" ? 5 : 2, hiringDeadline: ymd(future(45)) as any,
      description: `${j.company} is hiring a ${j.title} for ${j.location}. Regulated overseas placement via HPSEDC. Accommodation/transport per offer; full visa and deployment support.`,
    }).returning();
    jid[j.key] = row.id;
    jobCountry[j.key] = j.country;
    jobSalary[j.key] = j.salary;
  }
  console.log(`Jobs: ${JOBS.length + EXTRA_JOBS.length}`);

  // ── APPLICATIONS (one hero per stage + extra volume) ────────────────
  type A = { cand: string; job: string; status: string; score: number; reject?: string; empDec?: string };
  const APPS: A[] = [
    { cand: "arjun_thakur", job: "construction_dubai", status: "placed", score: 94, empDec: "selected_by_employer" },
    { cand: "priya_verma", job: "nurse_germany", status: "placed", score: 96, empDec: "selected_by_employer" },
    { cand: "rohit_sharma", job: "hotel_qatar", status: "placed", score: 88, empDec: "selected_by_employer" },
    { cand: "neha_chauhan", job: "housekeeping_bahrain", status: "placed", score: 84, empDec: "selected_by_employer" },
    { cand: "karan_rana", job: "driver_uae", status: "selected", score: 90, empDec: "selected_by_employer" },
    { cand: "meera_iyer", job: "caregiver_japan", status: "interview_scheduled", score: 86 },
    { cand: "vikram_negi", job: "welder_saudi", status: "shortlisted", score: 91 },
    { cand: "ananya_bhatt", job: "it_germany", status: "reviewed", score: 79 },
    { cand: "aman_kapoor", job: "plumber_kuwait", status: "submitted", score: 82 },
    { cand: "aman_kapoor", job: "electrician_oman", status: "submitted", score: 64 },
    { cand: "sahil_verma", job: "electrician_oman", status: "rejected", score: 71, reject: "Strong electrical fundamentals, but this Oman role needs documented high-voltage panel certification which is not on file. Encouraged to re-apply once the HV certificate is uploaded — a good fit otherwise." },
    // extra volume so agency/employer pipelines feel alive
    { cand: "vikram_negi", job: "construction_dubai", status: "reviewed", score: 67 },
    { cand: "karan_rana", job: "plumber_kuwait", status: "submitted", score: 58 },
    { cand: "ananya_bhatt", job: "it_germany", status: "reviewed", score: 79 },
    { cand: "rohit_sharma", job: "housekeeping_bahrain", status: "rejected", score: 44, reject: "Hospitality background is strong but oriented to front-office, not housekeeping operations. Better matched to the Qatar front-office role." },
  ];
  const aid: Record<string, string> = {};
  for (const a of APPS) {
    const [row] = await db.insert(applications).values({
      candidateId: cid[a.cand], jobId: jid[a.job], status: a.status, matchScore: a.score,
      rejectionFeedback: a.reject ?? null, employerDecision: a.empDec ?? null,
      employerDecisionAt: a.empDec ? past(10) : null,
    }).returning();
    aid[`${a.cand}|${a.job}`] = row.id;
  }
  console.log(`Applications: ${APPS.length}`);

  // ── BACKGROUND VOLUME APPLICATIONS (busy pipelines + agency leaderboard) ─
  // Flagship jobs are owned mostly by the top 3 agencies, so the volume + the
  // placements below concentrate on them — the leaderboard ranks them clearly.
  const BG_UNS = BG_CANDS.map((c) => c.un);
  // Top-agency jobs appear most often (gulf/europe/shivalik own ~16 of these), so
  // they dominate volume; the 4 mid-agency jobs at the end get a little too (no empty pipelines).
  const FLAGSHIP = ["construction_dubai", "nurse_germany", "welder_saudi", "pipefitter_saudi", "driver_uae", "caregiver_japan", "foreman_kuwait", "rigger_saudi", "cleaner_dubai", "waiter_qatar", "mason_kuwait", "nurse2_germany", "it_germany", "hotel_qatar", "steelfixer_kuwait", "crane_op_saudi", "scaffolder_saudi", "housekeeper_qatar", "cook_dubai", "caregiver3_germany", "maint_electrician_saudi"];
  const BG_STAGES = ["submitted", "reviewed", "reviewed", "shortlisted", "shortlisted", "interview_scheduled", "selected", "placed", "placed", "rejected"];
  const bgPlaced: { id: string; job: string }[] = [];
  let bgAppCount = 0;
  for (let i = 0; i < BG_UNS.length; i++) {
    for (let k = 0; k < 2; k++) {
      const job = FLAGSHIP[(i * 2 + k) % FLAGSHIP.length];
      const status = BG_STAGES[(i + k * 3) % BG_STAGES.length];
      const [row] = await db.insert(applications).values({
        candidateId: cid[BG_UNS[i]], jobId: jid[job], status,
        matchScore: 55 + ((i * 7 + k * 13) % 40),
        employerDecision: ["selected", "placed"].includes(status) ? "selected_by_employer" : null,
        employerDecisionAt: ["selected", "placed"].includes(status) ? past(8) : null,
      }).returning();
      bgAppCount++;
      if (status === "placed") bgPlaced.push({ id: row.id, job });
    }
  }
  if (bgPlaced.length) {
    await db.insert(placements).values(bgPlaced.map((p, idx) => ({
      applicationId: p.id, country: jobCountry[p.job] ?? "UAE", salary: jobSalary[p.job] ?? null,
      status: "active", candidateResponse: "accepted", visaStatus: "approved",
      startDate: past(25 + idx * 4), welfare30Day: "ok", welfare30DayAt: past(3),
    })));
  }
  console.log(`Background applications: ${bgAppCount} · background placements: ${bgPlaced.length}`);

  // ── INTERVIEWS (Meera: scheduled, awaiting candidate confirmation) ───
  await db.insert(interviews).values([
    { applicationId: aid["meera_iyer|caregiver_japan"], scheduledAt: future(6), location: "Virtual (Google Meet)", mode: "virtual", conductedBy: uid.europe_careers, interviewerName: "Anita Sood, Senior Recruiter", meetingLink: "https://meet.google.com/demo-care-iyer", candidateConfirmedStatus: null },
  ]);
  console.log("Interviews: 1");

  // ── PLACEMENTS (welfare + compliance states drive admin flags) ───────
  // Arjun: clean success — visa approved, welfare 30/60 done, 90 due.
  // Priya: clean — visa approved, welfare 30 done.
  // Neha: FLAG — visa applied (not approved) + PBBY pending; welfare overdue.
  // Rohit: FLAG — visa rejected.
  // Karan: offer issued, not yet accepted.
  await db.insert(placements).values([
    { applicationId: aid["arjun_thakur|construction_dubai"], appointmentLetterUrl: "/uploads/hs/placements/arjun_thakur-appointment.pdf", startDate: past(65), country: "UAE", salary: "AED 2,200/mo", status: "active", candidateResponse: "accepted", visaStatus: "approved",
      welfare30Day: "ok", welfare30DayAt: past(35), welfare30DayNotes: "Settled well; accommodation and salary as promised.", welfare60Day: "ok", welfare60DayAt: past(5), welfare60DayNotes: "No concerns; sending remittances home." },
    { applicationId: aid["priya_verma|nurse_germany"], appointmentLetterUrl: "/uploads/hs/placements/priya_verma-appointment.pdf", startDate: past(40), country: "Germany", salary: "EUR 3,500/mo", status: "active", candidateResponse: "accepted", visaStatus: "approved",
      welfare30Day: "ok", welfare30DayAt: past(8), welfare30DayNotes: "Completed hospital onboarding; language support ongoing." },
    { applicationId: aid["neha_chauhan|housekeeping_bahrain"], appointmentLetterUrl: "/uploads/hs/placements/neha_chauhan-appointment.pdf", startDate: past(45), country: "Bahrain", salary: "BHD 200/mo", status: "active", candidateResponse: "accepted", visaStatus: "applied" },
    { applicationId: aid["rohit_sharma|hotel_qatar"], appointmentLetterUrl: "/uploads/hs/placements/rohit_sharma-appointment.pdf", startDate: future(20), country: "Qatar", salary: "QAR 3,500/mo", status: "accepted", candidateResponse: "accepted", visaStatus: "rejected" },
    { applicationId: aid["karan_rana|driver_uae"], appointmentLetterUrl: "/uploads/hs/placements/karan_rana-appointment.pdf", startDate: future(35), country: "UAE", salary: "AED 2,500/mo", status: "offered", visaStatus: "not_applied" },
  ]);
  console.log("Placements: 5 (2 clean · 2 compliance-flagged · 1 offer pending)");

  // ── RECRUITMENT DRIVES ───────────────────────────────────────────────
  const [driveGulf] = await db.insert(recruitmentDrives).values({
    agencyId: gulfDirect.id, title: "Gulf Skilled Trades Drive — Dubai & Saudi", description: "On-the-spot interviews for construction, welding and driver roles.",
    date: future(12), location: "Hotel Peterhoff, Shimla", targetRoles: ["Welder", "Carpenter", "Driver"], expectedCandidates: 120, status: "approved", approvedBy: uid.demo_admin,
  }).returning();
  await db.insert(recruitmentDrives).values({
    agencyId: europeCareers.id, title: "Germany Healthcare Recruitment", description: "ICU nurses and caregivers with B1 German / IELTS.",
    date: future(20), location: "Hotel Holiday Home, Manali", targetRoles: ["Nurse", "Caregiver"], expectedCandidates: 70, status: "approved", approvedBy: uid.demo_admin,
  });
  await db.insert(recruitmentDrives).values({
    agencyId: himalayan.id, title: "Hospitality Fair — Gulf", description: "Pending HPSEDC approval.",
    date: future(40), location: "ITI Mandi", targetRoles: ["Housekeeping", "Front Office"], expectedCandidates: 60, status: "pending",
  });
  // Candidates registered for the approved Gulf drive, at various lifecycle
  // stages so the demo shows register → invited → attended.
  await db.insert(driveRegistrations).values([
    { driveId: driveGulf.id, userId: uid.vikram_negi, status: "invited" },   // hero cast — sees "You're invited"
    { driveId: driveGulf.id, userId: uid.deepak_sharma, status: "attended" },
    { driveId: driveGulf.id, userId: uid.ravi_kumar, status: "registered" },
    { driveId: driveGulf.id, userId: uid.sandeep_singh, status: "registered" },
    { driveId: driveGulf.id, userId: uid.ajay_rana, status: "registered" },
  ]);
  console.log("Drives: 3 · registrations: 5 (1 invited, 1 attended, 3 registered)");

  // ── NOTIFICATIONS ────────────────────────────────────────────────────
  await db.insert(notifications).values([
    { userId: uid.arjun_thakur, type: "application_update", title: "Welcome aboard in Dubai", message: "Your 60-day welfare check-in is complete. Next check-in at 90 days.", read: false },
    { userId: uid.karan_rana, type: "application_update", title: "You have an offer", message: "Al-Mansoori has issued an appointment letter for Heavy Vehicle Driver. Review and accept.", read: false },
    { userId: uid.meera_iyer, type: "application_update", title: "Interview scheduled", message: "Your caregiver interview is on " + future(6).toDateString() + ". Please confirm.", read: false },
    { userId: uid.ananya_bhatt, type: "application_update", title: "Application viewed", message: "Europe Careers has reviewed your IT Support application.", read: false },
    { userId: uid.gulf_jobs_direct, type: "application_update", title: "New shortlist to action", message: "Vikram Negi is shortlisted for Welder — schedule the interview.", read: false },
    { userId: uid.demo_admin, type: "system", title: "2 agencies awaiting verification", message: "Himalayan Overseas Consultants and Pioneer Manpower Services need review.", read: false },
    { userId: uid.demo_admin, type: "system", title: "2 employers awaiting verification", message: "Gulf Premier Hospitality and Nippon Skilled Labour need review.", read: false },
  ]);
  console.log("Notifications: 7");

  // ── AGENCY REVIEWS ───────────────────────────────────────────────────
  await db.insert(agencyReviews).values([
    { agencyId: gulfDirect.id, candidateUserId: uid.arjun_thakur, rating: 5, title: "Placed in Dubai, no hidden fees", review: "Gulf Jobs Direct handled my visa and travel. Everything was transparent." },
    { agencyId: europeCareers.id, candidateUserId: uid.priya_verma, rating: 5, title: "NHS-grade preparation", review: "They prepared me for the German language test and the move. Highly professional." },
  ]);

  // ── GRIEVANCES (owned by HPSEDC admin) + a sample two-way thread ──────
  const grRows = await db.insert(grievances).values([
    { userId: uid.neha_chauhan, category: "agency_complaint", subject: "Visa still not approved", description: "I have started work but my visa shows 'applied' for 6 weeks. Please follow up.", status: "under_review", assignedTo: uid.demo_admin, adminNotes: "Routed to HPSEDC admin queue." },
    { userId: uid.rohit_sharma, category: "application_issue", subject: "Visa rejected — what next?", description: "My Qatar visa was rejected. I need guidance on re-applying or an alternative placement.", status: "submitted", assignedTo: uid.demo_admin, adminNotes: "Routed to HPSEDC admin queue." },
  ]).returning();
  // Seed a real conversation on the first grievance so the thread isn't empty.
  await db.insert(grievanceComments).values([
    { grievanceId: grRows[0].id, userId: uid.neha_chauhan, authorRole: "candidate", body: "It has been six weeks and my visa is still showing 'applied'. I am worried — can you check with the agency?", createdAt: past(5) },
    { grievanceId: grRows[0].id, userId: uid.demo_admin, authorRole: "admin", body: "Thank you for reaching out. We have taken this up with Europe Careers and asked for a status update. We will revert within 2 working days.", createdAt: past(4) },
    { grievanceId: grRows[0].id, userId: uid.demo_admin, authorRole: "admin", body: "Internal: flagged to compliance — placement is active but visa not yet approved.", internal: true, createdAt: past(4) },
    { grievanceId: grRows[0].id, userId: uid.neha_chauhan, authorRole: "candidate", body: "Thank you, I appreciate the quick response.", createdAt: past(3) },
  ]);
  console.log("Grievances: 2 (admin-owned) · thread comments: 4");

  // ── AUDIT LOG (real cast history → the immutable trail demo) ──────────
  const appTransition = (actor: string, appKey: string, from: string, to: string, role: string, extra: any = {}) =>
    ({ userId: uid[actor], action: "update", resourceType: "application", resourceId: aid[appKey], details: { from, to, actorRole: role, ...extra }, ipAddress: "10.20.0.11" });
  await db.insert(auditLog).values([
    { userId: uid.demo_admin, action: "verify", resourceType: "agency", resourceId: europeCareers.id, details: { name: "Europe Careers Pvt. Ltd.", decision: "approved" }, ipAddress: "10.20.0.5", createdAt: past(420) },
    { userId: uid.demo_admin, action: "verify", resourceType: "agency", resourceId: gulfDirect.id, details: { name: "Gulf Jobs Direct", decision: "approved" }, ipAddress: "10.20.0.5", createdAt: past(300) },
    { userId: uid.demo_admin, action: "verify", resourceType: "employer", resourceId: almansoori.id, details: { name: "Al-Mansoori Construction & Contracting LLC", decision: "approved" }, ipAddress: "10.20.0.5", createdAt: past(260) },
    { userId: uid.demo_admin, action: "verify", resourceType: "employer", resourceId: sakura.id, details: { name: "Sakura Care & Staffing Group", decision: "approved" }, ipAddress: "10.20.0.5", createdAt: past(190) },
    { userId: uid.himalayan_overseas, action: "create", resourceType: "agency", resourceId: himalayan.id, details: { name: "Himalayan Overseas Consultants", event: "submitted_for_verification" }, ipAddress: "10.20.0.31", createdAt: past(3) },
    { userId: uid.gulf_premier, action: "create", resourceType: "employer", resourceId: gulfPremier.id, details: { name: "Gulf Premier Hospitality LLC", event: "submitted_for_verification" }, ipAddress: "10.20.0.42", createdAt: past(2) },
    // Arjun Thakur — full journey, submitted → placed
    appTransition("arjun_thakur", "arjun_thakur|construction_dubai", "—", "submitted", "candidate"),
    appTransition("gulf_jobs_direct", "arjun_thakur|construction_dubai", "submitted", "reviewed", "agent"),
    appTransition("gulf_jobs_direct", "arjun_thakur|construction_dubai", "reviewed", "shortlisted", "agent"),
    appTransition("almansoori_uae", "arjun_thakur|construction_dubai", "shortlisted", "interview_scheduled", "employer", { decision: "approved_for_interview" }),
    appTransition("almansoori_uae", "arjun_thakur|construction_dubai", "interview_scheduled", "selected", "employer"),
    appTransition("gulf_jobs_direct", "arjun_thakur|construction_dubai", "selected", "placed", "agent"),
    { userId: uid.gulf_jobs_direct, action: "create", resourceType: "placement", resourceId: aid["arjun_thakur|construction_dubai"], details: { candidate: "Arjun Thakur", country: "UAE", appointmentLetter: "issued" }, ipAddress: "10.20.0.11", createdAt: past(66) },
    // Priya, Vikram, Sahil
    appTransition("europe_careers", "priya_verma|nurse_germany", "reviewed", "shortlisted", "agent"),
    appTransition("sakura_care", "priya_verma|nurse_germany", "interview_scheduled", "selected", "employer"),
    appTransition("gulf_jobs_direct", "vikram_negi|welder_saudi", "reviewed", "shortlisted", "agent"),
    appTransition("gulf_jobs_direct", "sahil_verma|electrician_oman", "reviewed", "rejected", "agent", { reason: "HV certification not on file" }),
  ]);
  console.log("Audit log: 18 cast events");

  // ── FAQ ──────────────────────────────────────────────────────────────
  await db.insert(faq).values([
    { question: "How do I register on HireStream?", questionHi: "HireStream पर पंजीकरण कैसे करें?", answer: "Click Register, verify via email or mobile OTP, then complete your profile.", answerHi: "रजिस्टर पर क्लिक करें, OTP से सत्यापित करें, फिर प्रोफ़ाइल भरें।", category: "registration", sortOrder: 1 },
    { question: "What documents do I need for overseas jobs?", questionHi: "विदेशी नौकरियों के लिए कौन से दस्तावेज़ चाहिए?", answer: "A CV, valid passport, and educational certificates. Some roles need a trade certificate or licence.", answerHi: "सीवी, वैध पासपोर्ट और शैक्षिक प्रमाणपत्र।", category: "job_application", sortOrder: 2 },
    { question: "How are agencies verified?", questionHi: "एजेंसियों का सत्यापन कैसे होता है?", answer: "HPSEDC reviews the MEA licence and supporting documents before approving an agency. Look for the ✅ Verified badge.", answerHi: "HPSEDC अधिकारी MEA लाइसेंस की जाँच के बाद एजेंसी को मंज़ूरी देते हैं।", category: "agencies", sortOrder: 3 },
    { question: "What is PBBY insurance?", questionHi: "PBBY बीमा क्या है?", answer: "Pravasi Bharatiya Bima Yojana — mandatory insurance for ECR-category emigrant workers, arranged before departure.", answerHi: "प्रवासी भारतीय बीमा योजना — ECR श्रेणी के प्रवासी श्रमिकों के लिए अनिवार्य बीमा।", category: "overseas_placement", sortOrder: 4 },
  ]);
  console.log("FAQ: 4");

  // ── ANNOUNCEMENTS ────────────────────────────────────────────────────
  await db.insert(announcements).values([
    { title: "Gulf Skilled Trades Drive — Shimla", titleHi: "गल्फ स्किल्ड ट्रेड्स ड्राइव — शिमला", body: "Construction, welding and driver roles across UAE and Saudi Arabia. Walk-in interviews next month.", bodyHi: "यूएई और सऊदी अरब में निर्माण, वेल्डिंग और ड्राइवर भूमिकाएँ।", targetRole: "candidate" },
    { title: "Germany Healthcare Recruitment open", titleHi: "जर्मनी हेल्थकेयर भर्ती शुरू", body: "ICU nurses and caregivers with B1 German / IELTS. Visa sponsorship and language support provided.", bodyHi: "B1 जर्मन / IELTS के साथ ICU नर्स और देखभालकर्ता।", targetRole: null },
  ]);
  console.log("Announcements: 2");

  console.log("\n✅ Curated demo seed complete (expanded master set).");
  console.log("   25 candidates (10 hero) · 10 agencies (7✓/3⏳) · 10 employers (7✓/3⏳) · 28 jobs · " + (APPS.length + bgAppCount) + " applications · " + (5 + bgPlaced.length) + " placements");
  console.log("   Demo passwords: test123 · superadmin password from SEED_SUPERADMIN_PASSWORD (or dev default)\n");
  process.exit(0);
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
