import { Stethoscope, Cog, Building2, Zap, Monitor, Calculator, BookOpen,
  FlaskConical, Palette, CircleEllipsis, GraduationCap, Award, School } from "lucide-react";

// HP tier-3 (Professional) flow reference data. Everything maps onto the
// EXISTING candidate schema — no new tables/columns. Certifications are
// candidate_education rows with type:"certification".

export const PRO_EDU_LEVELS = [
  { key: "senior",  label: "12th class",        sub: "Plus two / senior secondary", icon: School,        qualificationLevel: "school" },
  { key: "diploma", label: "Diploma / ITI",     sub: "Polytechnic, GNM, trade",     icon: Award,         qualificationLevel: "diploma" },
  { key: "degree",  label: "University degree", sub: "Bachelor's, Master's, PhD",   icon: GraduationCap, qualificationLevel: "" },
] as const;

export const DEGREE_TYPES = [
  { key: "bachelor",  label: "Bachelor's", sub: "BA, B.Sc, B.Tech, B.Sc Nursing…", qualificationLevel: "bachelor",  degreeLabel: "Bachelor's Degree" },
  { key: "master",    label: "Master's",   sub: "MA, M.Sc, M.Tech, MBA…",           qualificationLevel: "master",    degreeLabel: "Master's Degree" },
  { key: "doctorate", label: "PhD",        sub: "Doctorate / research degree",      qualificationLevel: "doctorate", degreeLabel: "PhD" },
] as const;

// field → candidate_education.subject + preferredCategories key + which
// SKILL_CATEGORIES group to surface first on the skills screen.
export const PRO_FIELDS = [
  { key: "nursing",    label: "Nursing / Healthcare",   icon: Stethoscope,    category: "healthcare",  skillCategory: "Healthcare & Nursing" },
  { key: "mech",       label: "Mechanical Engineering", icon: Cog,            category: "engineering", skillCategory: "Construction & Engineering" },
  { key: "civil",      label: "Civil Engineering",      icon: Building2,      category: "engineering", skillCategory: "Construction & Engineering" },
  { key: "electrical", label: "Electrical Engineering", icon: Zap,            category: "engineering", skillCategory: "Construction & Engineering" },
  { key: "cs",         label: "Computer Science / IT",  icon: Monitor,        category: "it",          skillCategory: "Information Technology" },
  { key: "commerce",   label: "Commerce / Finance",     icon: Calculator,     category: "sales",       skillCategory: "Office & Administration" },
  { key: "teaching",   label: "Teaching / Education",   icon: BookOpen,       category: "education",   skillCategory: "Languages & Soft Skills" },
  { key: "science",    label: "Science",                icon: FlaskConical,   category: "other",       skillCategory: "Healthcare & Nursing" },
  { key: "arts",       label: "Arts / Humanities",      icon: Palette,        category: "other",       skillCategory: "Office & Administration" },
  { key: "other",      label: "Something else",         icon: CircleEllipsis, category: "other",       skillCategory: "Office & Administration" },
] as const;

export const CERT_SUGGESTIONS: Record<string, string[]> = {
  nursing:    ["State Nursing Council Registration", "BLS", "ACLS", "OET"],
  cs:         ["AWS Certified", "Microsoft Azure", "PMP", "Scrum Master", "CCNA"],
  mech:       ["AutoCAD", "SolidWorks", "NEBOSH Safety", "PMP"],
  civil:      ["AutoCAD", "Revit", "NEBOSH Safety", "PMP"],
  electrical: ["Wireman Licence", "PLC / SCADA", "NEBOSH Safety"],
  commerce:   ["Tally", "CA Inter", "CFA Level 1"],
  teaching:   ["B.Ed", "TET / CTET", "TEFL / TESOL"],
};

// Values MUST match DESTINATION_COUNTRIES / IELTS_COUNTRIES keys exactly.
export const PRO_COUNTRIES: { name: string; flag: string }[] = [
  { name: "UAE", flag: "🇦🇪" }, { name: "Saudi Arabia", flag: "🇸🇦" }, { name: "Qatar", flag: "🇶🇦" },
  { name: "UK", flag: "🇬🇧" }, { name: "Germany", flag: "🇩🇪" }, { name: "Canada", flag: "🇨🇦" },
  { name: "Australia", flag: "🇦🇺" }, { name: "Ireland", flag: "🇮🇪" }, { name: "New Zealand", flag: "🇳🇿" },
  { name: "Singapore", flag: "🇸🇬" }, { name: "Japan", flag: "🇯🇵" }, { name: "USA", flag: "🇺🇸" },
];

export const IELTS_BANDS = Array.from({ length: 11 }, (_, i) => (4 + i * 0.5).toFixed(1)); // "4.0" … "9.0"
