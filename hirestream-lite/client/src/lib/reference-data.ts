// ── Himachal Pradesh Districts (LGD-based) ──────────────────────────

export const HP_DISTRICTS = [
  "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur",
  "Kullu", "Lahaul & Spiti", "Mandi", "Shimla", "Sirmaur",
  "Solan", "Una"
];

// ── Indian States (for broader location) ────────────────────────────

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Chandigarh", "Puducherry"
];

// ── Countries (common overseas destinations + others) ───────────────

export const DESTINATION_COUNTRIES = [
  // Top destinations for HP workers
  { value: "UAE", label: "UAE (Dubai, Abu Dhabi)", region: "Middle East" },
  { value: "Saudi Arabia", label: "Saudi Arabia", region: "Middle East" },
  { value: "Qatar", label: "Qatar", region: "Middle East" },
  { value: "Oman", label: "Oman", region: "Middle East" },
  { value: "Kuwait", label: "Kuwait", region: "Middle East" },
  { value: "Bahrain", label: "Bahrain", region: "Middle East" },
  { value: "Canada", label: "Canada", region: "Americas" },
  { value: "Australia", label: "Australia", region: "Asia Pacific" },
  { value: "New Zealand", label: "New Zealand", region: "Asia Pacific" },
  { value: "UK", label: "United Kingdom", region: "Europe" },
  { value: "Germany", label: "Germany", region: "Europe" },
  { value: "Ireland", label: "Ireland", region: "Europe" },
  { value: "Singapore", label: "Singapore", region: "Asia Pacific" },
  { value: "Malaysia", label: "Malaysia", region: "Asia Pacific" },
  { value: "Japan", label: "Japan", region: "Asia Pacific" },
  { value: "South Korea", label: "South Korea", region: "Asia Pacific" },
  { value: "USA", label: "United States", region: "Americas" },
  { value: "Italy", label: "Italy", region: "Europe" },
  { value: "Poland", label: "Poland", region: "Europe" },
  { value: "Romania", label: "Romania", region: "Europe" },
];

// ── Skills by Category ──────────────────────────────────────────────

export const SKILL_CATEGORIES: { category: string; skills: string[] }[] = [
  {
    category: "Information Technology",
    skills: [
      "React", "Node.js", "JavaScript", "TypeScript", "Python", "Java",
      "C++", "PHP", "SQL", "MongoDB", "PostgreSQL", "MySQL",
      "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
      "DevOps", "CI/CD", "Git", "Linux", "REST API",
      "HTML", "CSS", "Tailwind", "Angular", "Vue.js",
      "React Native", "Flutter", "Swift", "Android", "iOS",
      "Machine Learning", "Data Science", "AI",
      "Cybersecurity", "Network Administration", "SAP",
    ],
  },
  {
    category: "Healthcare & Nursing",
    skills: [
      "Nursing", "Patient Care", "CPR", "BLS", "ACLS",
      "ICU Care", "Emergency Care", "Pediatric Care",
      "Geriatric Care", "Mental Health Nursing",
      "Pharmacy", "Lab Technician", "Radiology",
      "Physiotherapy", "Occupational Therapy",
      "Medical Coding", "Health Records", "Infection Control",
      "Midwifery", "Dental Assistant", "Optometry",
    ],
  },
  {
    category: "Construction & Engineering",
    skills: [
      "Welding", "Plumbing", "Electrical", "HVAC",
      "Carpentry", "Masonry", "Painting", "Tiling",
      "Civil Engineering", "Structural Engineering",
      "AutoCAD", "Revit", "Project Management",
      "Site Supervision", "Quality Control", "Safety Management",
      "Crane Operation", "Heavy Equipment", "Scaffolding",
      "Piping", "Fabrication", "Steel Fixing",
    ],
  },
  {
    category: "Hospitality & Tourism",
    skills: [
      "Cooking", "Baking", "Pastry", "Chef",
      "Hotel Management", "Front Desk", "Housekeeping",
      "F&B Service", "Bartending", "Barista",
      "Event Management", "Tourism Guide", "Travel Agent",
      "Restaurant Management", "Catering",
      "Food Safety", "HACCP", "Menu Planning",
    ],
  },
  {
    category: "Manufacturing & Industrial",
    skills: [
      "Machine Operation", "CNC Programming", "Quality Inspection",
      "Assembly Line", "Packaging", "Forklift Operation",
      "Warehouse Management", "Inventory Control",
      "Textile", "Garment", "Tailoring", "Embroidery",
      "Electronics Assembly", "PCB Soldering",
      "Plastic Molding", "Die Casting",
    ],
  },
  {
    category: "Office & Administration",
    skills: [
      "MS Office", "Excel", "Word", "PowerPoint",
      "Data Entry", "Typing", "Accounting", "Tally",
      "HR Management", "Payroll", "Recruitment",
      "Customer Service", "Call Center", "Receptionist",
      "Office Administration", "Filing", "Scheduling",
    ],
  },
  {
    category: "Transport & Logistics",
    skills: [
      "Driving (LMV)", "Driving (HMV)", "Driving (International)",
      "Logistics", "Supply Chain", "Fleet Management",
      "Delivery", "Courier", "Shipping",
      "Cold Chain Management", "Customs Clearance",
    ],
  },
  {
    category: "Languages & Soft Skills",
    skills: [
      "English", "Hindi", "Arabic", "French", "German",
      "Japanese", "Korean", "Mandarin",
      "Communication", "Leadership", "Team Management",
      "Problem Solving", "Time Management", "Negotiation",
      "Presentation", "Public Speaking",
    ],
  },
];

// Flat list for search
export const ALL_SKILLS = SKILL_CATEGORIES.flatMap(c => c.skills);

// ── Major cities per destination country ────────────────────────────
// Covers ~90%+ of overseas hiring destinations. Use with "Other" escape hatch for
// edge cases (smaller towns, newly-named districts, etc.)
// Keys MUST match country_info.name exactly — the server validator rejects
// jobs whose country isn't in country_info. The old aliases ("UAE", "UK",
// "USA") were normalised in the v0.7.3.2 data migration; client-side
// lookups now use the full canonical names.
//
// Countries beyond the 18 in country_info (Italy, Poland, Romania,
// South Korea) are kept here as historical city data — they won't appear
// in any country dropdown until added to country_info via the admin
// Countries tab.
export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Fujairah", "Ras Al Khaimah", "Umm Al Quwain", "Al Ain"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar", "Dhahran", "Taif", "Tabuk", "Buraidah", "Hail", "Jubail", "Yanbu", "Abha", "Najran"],
  Qatar: ["Doha", "Al Rayyan", "Al Wakrah", "Al Khor", "Lusail", "Mesaieed"],
  Oman: ["Muscat", "Salalah", "Sohar", "Nizwa", "Sur", "Duqm", "Ibri"],
  Kuwait: ["Kuwait City", "Al Ahmadi", "Hawalli", "Farwaniya", "Jahra", "Mubarak Al-Kabeer"],
  Bahrain: ["Manama", "Riffa", "Muharraq", "Hamad Town", "A'ali", "Isa Town", "Sitra"],
  Canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Hamilton", "Kitchener", "Halifax", "Victoria", "Saskatoon", "Regina", "London (ON)", "Mississauga", "Brampton", "Surrey"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle", "Wollongong", "Hobart", "Geelong", "Darwin", "Townsville", "Cairns"],
  "New Zealand": ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin", "Palmerston North", "Napier", "Queenstown", "Nelson"],
  "United Kingdom": ["London", "Birmingham", "Manchester", "Leeds", "Liverpool", "Sheffield", "Bristol", "Newcastle", "Nottingham", "Leicester", "Glasgow", "Edinburgh", "Cardiff", "Belfast", "Southampton", "Portsmouth", "Oxford", "Cambridge", "Coventry", "Bradford", "Aberdeen", "Brighton", "Reading", "Milton Keynes", "Plymouth", "York"],
  Germany: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hanover", "Nuremberg", "Erlangen", "Heidelberg", "Bonn", "Mannheim"],
  Ireland: ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Drogheda", "Dundalk", "Swords", "Bray"],
  Singapore: ["Singapore"],
  Malaysia: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Petaling Jaya", "Kota Kinabalu", "Kuching", "Malacca", "Penang", "Putrajaya", "Cyberjaya"],
  Japan: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Kawasaki", "Saitama", "Hiroshima", "Sendai", "Chiba"],
  "South Korea": ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan", "Yongin", "Changwon"],
  "United States of America": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "San Francisco", "Indianapolis", "Seattle", "Denver", "Washington DC", "Boston", "Nashville", "Atlanta", "Miami", "Portland"],
  Italy: ["Rome", "Milan", "Naples", "Turin", "Palermo", "Genoa", "Bologna", "Florence", "Bari", "Catania", "Venice", "Verona"],
  Poland: ["Warsaw", "Kraków", "Łódź", "Wrocław", "Poznań", "Gdańsk", "Szczecin", "Bydgoszcz", "Lublin", "Katowice"],
  Romania: ["Bucharest", "Cluj-Napoca", "Timișoara", "Iași", "Constanța", "Craiova", "Brașov", "Galați", "Ploiești", "Oradea"],
  Maldives: ["Malé", "Hulhumalé", "Addu City"],
  Israel: ["Tel Aviv", "Jerusalem", "Haifa", "Rishon LeZion", "Petah Tikva", "Ashdod", "Netanya", "Beersheba"],
};

export const MAX_CUSTOM_CITY_LEN = 80;

// v0.4.33 (Phase 3): mirror of IELTS_COUNTRIES on the server. Used by
// the job-poster forms to decide whether to render an IELTS band field
// (numeric 4.0–9.0) or a CEFR-level language picker.
export const IELTS_COUNTRIES = new Set(["UK", "Australia", "New Zealand", "Canada", "Ireland", "USA"]);

// ── Education vocabulary (UAT-03 #5/#8, 2026-07-16) ──────────────────
// The Degree/Qualification field was free text, so the same qualification
// arrived six different ways ("12th", "12th (Science)", "12th (Arts)",
// "12th (Senior Secondary)"…) and duplicate-detection — which compares the
// typed string — could never catch them. A picker makes the stored value
// canonical, which is what makes dedup work at all. Variants that used to be
// baked into the string (stream, trade, specialisation) belong in the
// Subject/Field box next to it, not in the qualification name.
//
// "Other (specify)" stays available — a govt portal can't enumerate every
// qualification in India — so the server still normalises and re-checks.
export const EDU_OTHER = "__other__";

export const EDUCATION_OPTIONS: Record<string, string[]> = {
  school: ["5th", "8th", "10th (Matriculation)", "12th (Senior Secondary)"],
  university: [
    "B.A.", "B.Com.", "B.Sc.", "B.Sc. Nursing", "B.Tech / B.E.", "BBA", "BCA",
    "B.Ed.", "LLB", "MBBS", "M.A.", "M.Com.", "M.Sc.", "M.Tech / M.E.", "MBA",
    "MCA", "PhD",
  ],
  diploma: [
    "ITI — Electrician", "ITI — Welder", "ITI — Fitter", "ITI — Plumber",
    "ITI — Carpenter", "ITI — Mechanic (Motor Vehicle)", "ITI — Turner",
    "Polytechnic Diploma", "GNM (Nursing)", "ANM (Nursing)",
    "Diploma in Hotel Management", "Diploma in Geriatric Care",
  ],
  certification: [
    "NCVT / NSDC Trade Certificate", "Welding Certification (3G / 6G)",
    "Electrician Licence", "Driving Licence — LMV", "Driving Licence — HMV",
    "Nursing Council Registration", "Food Safety (FSSAI)",
    "AWS Certification", "PMP", "CCNA",
  ],
  // Certificate course = training ATTENDED, with no authority examining you.
  // The set is open, so this is a short list of unambiguous cases + free text —
  // not an attempt to enumerate it.
  //
  // Every entry here is deliberately something NOBODY certifies you for. Earlier
  // drafts listed First Aid, Fire Safety, Scaffolding, Forklift Operation,
  // Industrial Safety and Food Safety — all removed, because each has a real
  // certification counterpart (Red Cross, CISRS, forklift licence, FSSAI) and
  // would collide with the Certification tab, recreating the very ambiguity
  // UAT-03 #9 asked us to remove. If an authority tests you and issues an ID,
  // it belongs under Certification.
  //
  // The skills themselves (carpentry, welding, Java) are NOT education — those
  // live on the Skills & Preferences step.
  // Kept to 5 examples on purpose: enough to show what belongs here, short
  // enough that nobody mistakes it for the full set. Everything else is typed.
  course: [
    "Spoken English",
    "Basic Arabic",
    "Computer Basics (NIELIT / CSC)",
    "Tailoring / Stitching",
    "Housekeeping Training",
  ],
};

// Per-type wording. The old form called every type a "Degree / Qualification"
// and hinted "B.Tech, MBA, …" even on a Skill Course, whose whole point is that
// it ISN'T a degree — the type chip changed but the fields didn't follow.
export const EDU_TYPE_COPY: Record<string, { field: string; institution: string; instPlaceholder: string }> = {
  school:        { field: "Class / Level",        institution: "School name",      instPlaceholder: "Govt. Sr. Sec. School, …" },
  university:    { field: "Degree",               institution: "College name",     instPlaceholder: "University / College name" },
  diploma:       { field: "Diploma / Trade",      institution: "Institute name",   instPlaceholder: "ITI / Polytechnic name" },
  certification: { field: "Certification",        institution: "Issuing body",     instPlaceholder: "NCVT, NSDC, AWS, …" },
  course:        { field: "Certificate course",   institution: "Training provider", instPlaceholder: "Institute / training centre" },
};

// v0.4.33 (Phase 3): qualification levels, ordered. Used by the job-
// poster dropdown and the candidate wizard so both ends speak the same
// vocabulary (server vs2 engine relies on these exact keys).
export const QUALIFICATION_LEVELS: { value: string; label: string }[] = [
  { value: "school",    label: "School (10th / 12th)" },
  { value: "diploma",   label: "Diploma / Polytechnic" },
  { value: "bachelor",  label: "Bachelor's degree" },
  { value: "master",    label: "Master's degree" },
  { value: "doctorate", label: "Doctorate / PhD" },
];

// v0.4.33 (Phase 3): CEFR levels for non-IELTS country language scoring.
export const CEFR_LEVELS: { value: string; label: string }[] = [
  { value: "A1", label: "A1 — Beginner" },
  { value: "A2", label: "A2 — Elementary" },
  { value: "B1", label: "B1 — Intermediate" },
  { value: "B2", label: "B2 — Upper-intermediate" },
  { value: "C1", label: "C1 — Advanced" },
  { value: "C2", label: "C2 — Proficient / Native" },
];

// Common languages relevant to overseas placement.
export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "english",   label: "English" },
  { value: "arabic",    label: "Arabic" },
  { value: "german",    label: "German" },
  { value: "french",    label: "French" },
  { value: "spanish",   label: "Spanish" },
  { value: "japanese",  label: "Japanese" },
  { value: "mandarin",  label: "Mandarin" },
  { value: "portuguese",label: "Portuguese" },
  { value: "hindi",     label: "Hindi" },
];

// ── Job categories ──────────────────────────────────────────────────
// v0.4.31 (HPSEDC Item 8): client-side mirror of server's job-categories.seed.ts.
// Keep these two lists in sync — the server is authoritative; this list only
// drives the dropdown and filter UI. Server validates on submit.
export interface JobCategoryOption {
  key: string;
  label: string;
  tier: "blue_collar" | "skilled_trade" | "service" | "professional";
}

export const JOB_CATEGORIES: JobCategoryOption[] = [
  // HPSEDC-mandated (Item 8)
  { key: "factory_worker",      label: "Factory Worker",      tier: "blue_collar" },
  { key: "construction_worker", label: "Construction Worker", tier: "blue_collar" },
  { key: "driver",              label: "Driver",              tier: "skilled_trade" },
  { key: "electrician",         label: "Electrician",         tier: "skilled_trade" },
  { key: "plumber",             label: "Plumber",             tier: "skilled_trade" },
  { key: "helper",              label: "Helper",              tier: "blue_collar" },
  { key: "technician",          label: "Technician",          tier: "skilled_trade" },
  { key: "hospitality_staff",   label: "Hospitality Staff",   tier: "service" },
  { key: "caregiver",           label: "Caregiver",           tier: "service" },
  { key: "warehouse_worker",    label: "Warehouse Worker",    tier: "blue_collar" },
  // Additional
  { key: "healthcare",  label: "Healthcare",  tier: "professional" },
  { key: "it",          label: "IT",          tier: "professional" },
  { key: "engineering", label: "Engineering", tier: "professional" },
  { key: "sales",       label: "Sales",       tier: "professional" },
  { key: "education",   label: "Education",   tier: "professional" },
  { key: "other",       label: "Other",       tier: "professional" },
];

export function jobCategoryLabel(key: string | null | undefined): string {
  if (!key) return "—";
  const found = JOB_CATEGORIES.find((c) => c.key === key);
  if (found) return found.label;
  return String(key).split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Field length limits (reused across forms) ───────────────────────
export const FIELD_LIMITS = {
  jobTitle: 120,
  companyName: 150,
  location: 120,
  city: 80,
  salary: 120,
  shortDescription: 500,
  longDescription: 5000,
  internalNotes: 2000,
  personName: 100,
  email: 120,
  phone: 20,
  address: 200,
  pincode: 10,
  licenseNumber: 50,
  agencyName: 150,
  grievanceSubject: 200,
  grievanceBody: 3000,
  driveTitle: 150,
  skillsMax: 30,
  tagItem: 40,
} as const;

// ── UAT-03 #15: documents required per destination country ────────────────
// Jobs inherit their country's matrix; on a job the candidate sees ONLY the
// documents that job/country needs (with a have/need marker), not a generic
// list. Base docs apply to every overseas placement; per-country adds extra.
export const BASE_JOB_DOCUMENTS = ["identity_proof", "passport", "medical_certificate", "police_clearance"];
export const COUNTRY_DOC_REQUIREMENTS: Record<string, string[]> = {
  "UAE": ["educational_certificate"],
  "Saudi Arabia": ["educational_certificate", "trade_test"],
  "Qatar": ["educational_certificate"],
  "Kuwait": ["educational_certificate"],
  "Oman": [],
  "Bahrain": [],
  "UK": ["educational_certificate", "ielts", "cv"],
  "Germany": ["educational_certificate", "cv"],
  "Canada": ["educational_certificate", "ielts", "cv"],
  "Australia": ["educational_certificate", "ielts", "cv"],
  "Ireland": ["educational_certificate", "ielts", "cv"],
  "New Zealand": ["educational_certificate", "ielts", "cv"],
  "Singapore": ["educational_certificate", "cv"],
  "Japan": ["educational_certificate", "cv"],
  "USA": ["educational_certificate", "ielts", "cv"],
};
export const DOC_TYPE_LABELS: Record<string, string> = {
  identity_proof: "ID (Aadhaar / Voter ID)",
  passport: "Passport",
  medical_certificate: "Medical fitness certificate",
  police_clearance: "Police clearance (PCC)",
  educational_certificate: "Education certificate",
  experience_certificate: "Work experience letter",
  trade_test: "Trade test result",
  ielts: "IELTS score",
  cv: "CV / Resume",
  certificate: "Certificate",
  other: "Other document",
};
// Types the candidate can upload in-portal now (so we can show have/need);
// the rest (medical/PCC/trade test/IELTS) they arrange offline.
export const UPLOADABLE_DOC_TYPES = new Set(["identity_proof", "passport", "educational_certificate", "experience_certificate", "cv", "certificate", "other"]);
export function requiredDocsForCountry(country: string): string[] {
  return [...BASE_JOB_DOCUMENTS, ...(COUNTRY_DOC_REQUIREMENTS[country] || [])];
}

// ── UAT-03 #14: seeded typical MONTHLY salary bands per category × country ──
// Cold-start backstop so a candidate sees a realistic range and sets an
// ALIGNED expectation for the category (published-job percentiles refine later).
// Figures are indicative overseas wages; local currency per country.
export const SALARY_BAND_CURRENCY: Record<string, string> = {
  "UAE": "AED", "Saudi Arabia": "SAR", "Qatar": "QAR", "Kuwait": "KWD", "Oman": "OMR", "Bahrain": "BHD",
};
const CATEGORY_BASE_AED: Record<string, [number, number]> = {
  construction: [1200, 2800], transport: [1500, 3500], hospitality: [1200, 2600],
  healthcare: [3000, 8000], manufacturing: [1300, 3000], security: [1500, 3200],
  agriculture: [1000, 2200], it: [6000, 15000], engineering: [5000, 14000],
  sales: [2500, 7000], education: [4000, 10000], other: [1200, 3000],
};
const AED_TO_LOCAL: Record<string, number> = {
  "UAE": 1, "Saudi Arabia": 1.02, "Qatar": 0.99, "Kuwait": 0.083, "Oman": 0.105, "Bahrain": 0.103,
};
export function salaryBandFor(category: string, country: string): { min: number; max: number; currency: string } | null {
  const base = CATEGORY_BASE_AED[category]; const mult = AED_TO_LOCAL[country]; const cur = SALARY_BAND_CURRENCY[country];
  if (!base || mult == null || !cur) return null;
  const fine = cur === "KWD" || cur === "OMR" || cur === "BHD";
  const round = (n: number) => fine ? Math.round((n * mult) / 5) * 5 : Math.round((n * mult) / 50) * 50;
  return { min: round(base[0]), max: round(base[1]), currency: cur };
}

// ── UAT-03 #16: official Govt-of-India help for placed overseas workers ──
// Real, safe channels (no fabricated phone numbers). Shown post-placement.
export const OVERSEAS_HELP_LINKS = [
  { label: "MADAD — Consular grievance portal", url: "https://madad.gov.in", note: "File and track a complaint with the Indian mission abroad." },
  { label: "eMigrate — MEA emigration portal", url: "https://emigrate.gov.in", note: "Emigration, PBGY insurance and registered recruiter info." },
];
// Indian mission locator per destination (official pattern; candidate confirms
// the exact contact on the mission's own site). Kept as a helper string.
export function indianMissionNote(country: string): string {
  return `Contact the Indian Embassy/Consulate in ${country || "your destination country"} for on-ground help. Find it via MADAD or the MEA website.`;
}
