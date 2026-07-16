/**
 * Seeds ~15 destination countries that HPSEDC overseas placements go to
 * most often. Idempotent; admin edits in the UI are preserved (seed only
 * inserts missing rows, never overwrites). The figures are ballpark
 * references for candidates, not legal advice — copy is deliberately
 * cautious and points to the Indian Embassy for anything official.
 */

import { storage } from "../storage";
import { countryInfo } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";

interface Seed {
  code: string; name: string;
  embassyPhone?: string; embassyEmail?: string; embassyAddress?: string; embassyWebsite?: string;
  visaTimelineDays?: number;
  minWageNote?: string;
  laborLawSummary?: string;
  costOfLivingNote?: string;
  climateNote?: string;
  entryRequirements?: string;
  emergencyContact?: string;
}

const DEFAULTS: Seed[] = [
  {
    code: "AE", name: "United Arab Emirates",
    embassyPhone: "+971-2-4492700", embassyEmail: "cons1.abudhabi@mea.gov.in", embassyWebsite: "https://www.eoiabudhabi.gov.in",
    visaTimelineDays: 30,
    minWageNote: "No federal minimum wage for expats; wages are contract-driven. Housing & transport typically provided for blue-collar roles.",
    laborLawSummary: "UAE Labour Law 33 of 2021 governs private-sector workers. End-of-service gratuity payable on completion (21 days/year for first 5 years). Weekly rest + paid annual leave guaranteed. Never surrender your passport — it is illegal for an employer to hold it.",
    costOfLivingNote: "Roughly 1.8–2.5x Himachal COL; employer-provided accommodation offsets most of this. Send-home share typically 60–75% of salary.",
    climateNote: "Hot desert. May–September 40°C+. Construction work hours reduced 12:30–15:00 (outdoor ban) in peak summer. Ramadan hours shorter.",
    entryRequirements: "Passport 6+ months validity, medical fitness certificate (GAMCA approved), police clearance, attested education certificates (MEA + UAE embassy).",
    emergencyContact: "MEA 24x7 helpline: +91-11-23012113 · India in Distress (eMigrate): +91-1800-113-090",
  },
  {
    code: "SA", name: "Saudi Arabia",
    embassyPhone: "+966-11-4884144", embassyEmail: "hoc.riyadh@mea.gov.in", embassyWebsite: "https://www.eoiriyadh.gov.in",
    visaTimelineDays: 45,
    minWageNote: "Saudization quota rules. Contract specifies wage + allowances; ensure a copy in both English and Arabic.",
    laborLawSummary: "Labour Law (Royal Decree M/51) governs contracts. End-of-service gratuity (half-month wage per year for first 5, then full month). Iqama (residence permit) must be obtained within 90 days of arrival. Kafala sponsorship reforms (2021) allow job mobility under defined conditions.",
    costOfLivingNote: "Riyadh/Jeddah cities pricier than Himachal by 2x; rural sites lower. Accommodation + food usually employer-provided for blue-collar.",
    climateNote: "Extreme summer (45°C+). Friday is the weekly rest day. During Ramadan, public eating/drinking daytime is restricted.",
    entryRequirements: "Valid passport 6+ months, attested education + experience certificates (MEA + Saudi Culture Ministry), medical certificate (GAMCA), police clearance.",
    emergencyContact: "Embassy of India Riyadh 24x7: +966-11-4884144 · MEA helpline: +91-11-23012113",
  },
  {
    code: "QA", name: "Qatar",
    embassyPhone: "+974-44255777", embassyEmail: "amb.doha@mea.gov.in", embassyWebsite: "https://www.indianembassyqatar.gov.in",
    visaTimelineDays: 30,
    minWageNote: "Minimum wage QAR 1000/month + food allowance QAR 300 + housing allowance QAR 500 (if not provided in kind). Law 17 of 2020.",
    laborLawSummary: "Kafala abolished in 2020 — workers can change jobs without employer's NOC. Wage Protection System (WPS) mandates electronic salary transfer. End-of-service gratuity: 3 weeks/year minimum.",
    costOfLivingNote: "Doha is expensive; basics ~2x Himachal. Blue-collar housing typically employer-provided. Remittances 60–80% of salary common.",
    climateNote: "Very hot May–September. Outdoor work banned 10:00–15:30 June–September. Friday + Saturday weekend.",
    entryRequirements: "Passport 6+ months validity, attested education/experience (MEA + Qatar embassy), medical fitness, police clearance. Biometrics on arrival.",
    emergencyContact: "Indian Embassy Doha: +974-44255777 · MEA helpline: +91-11-23012113",
  },
  {
    code: "KW", name: "Kuwait",
    embassyPhone: "+965-22562151", embassyEmail: "hoc.kuwait@mea.gov.in", embassyWebsite: "https://www.indembkwt.gov.in",
    visaTimelineDays: 45,
    minWageNote: "Private sector minimum ~KWD 75/month; reality for domestic workers is often higher per bilateral MoU with India.",
    laborLawSummary: "Labour Law 6 of 2010. 48-hour work week standard. End-of-service indemnity: 15 days/year (first 5), 1 month/year after. Friday + Saturday weekend.",
    costOfLivingNote: "Costly — roughly 2–2.5x Himachal for urban living. Employer-provided housing typical for contracted workers.",
    climateNote: "Extreme summer heat. Ramadan working hours reduced.",
    entryRequirements: "Passport validity, attested education + police clearance + medical fitness. MoCI work visa via sponsoring employer.",
    emergencyContact: "Embassy of India Kuwait: +965-22562151",
  },
  {
    code: "OM", name: "Oman",
    embassyPhone: "+968-24684500", embassyEmail: "hoc.muscat@mea.gov.in", embassyWebsite: "https://www.indemb-oman.gov.in",
    visaTimelineDays: 30,
    minWageNote: "Omanization drives private-sector wages for locals; expat wages contract-driven.",
    laborLawSummary: "Labour Law Royal Decree 35/2003. End-of-service gratuity. Friday + Saturday weekend. Reasonable worker protections including no passport-confiscation allowed.",
    costOfLivingNote: "Muscat ~1.8x Himachal; interior regions lower.",
    climateNote: "Hot + humid summer. Coastal regions milder than interior.",
    entryRequirements: "Passport validity, attested education, medical certificate, police clearance.",
    emergencyContact: "Embassy of India Muscat: +968-24684500",
  },
  {
    code: "BH", name: "Bahrain",
    embassyPhone: "+973-17180200", embassyEmail: "indembmanama@bh-indianembassy.gov.in", embassyWebsite: "https://www.indianembassybahrain.gov.in",
    visaTimelineDays: 30,
    laborLawSummary: "Labour Law for Private Sector 36/2012. Flexible work permit ('Flexi') available for some roles. End-of-service indemnity required.",
    climateNote: "Hot summer similar to UAE. Friday–Saturday weekend.",
    entryRequirements: "Passport 6+ months, attested education, medical + police clearance.",
    emergencyContact: "Indian Embassy Manama: +973-17180200",
  },
  {
    code: "MY", name: "Malaysia",
    embassyPhone: "+603-42025600", embassyEmail: "hoc.kl@mea.gov.in", embassyWebsite: "https://www.hcikl.gov.in",
    visaTimelineDays: 30,
    minWageNote: "National minimum wage RM 1,500/month (2023 revision).",
    laborLawSummary: "Employment Act 1955 + amendments. Overtime pay required beyond 48 hrs/week. Never surrender passport to employer.",
    costOfLivingNote: "KL and Penang costlier than rural Malaysia; overall ~1.4x Himachal.",
    climateNote: "Tropical, rain year-round. Haze episodes possible.",
    entryRequirements: "Passport 6+ months, FWCMS approval, medical, work visa (VDR).",
    emergencyContact: "High Commission of India Kuala Lumpur: +603-42025600",
  },
  {
    code: "SG", name: "Singapore",
    embassyPhone: "+65-62376777", embassyEmail: "hoc.singapore@mea.gov.in", embassyWebsite: "https://www.hcisingapore.gov.in",
    visaTimelineDays: 20,
    minWageNote: "Work Permit wages vary by sector (construction/manufacturing/services); no universal minimum but Progressive Wage Models apply to licensed sectors.",
    laborLawSummary: "Employment Act. MOM regulates Work Permits / S-Pass / Employment Pass. Work Permit holders cannot bring dependents and must pass 6-monthly medical.",
    costOfLivingNote: "Very expensive — 2.5–3x Himachal for a single worker; dormitory housing for blue-collar keeps costs bearable.",
    climateNote: "Tropical, humid, rain year-round.",
    entryRequirements: "Valid passport, employer's IPA letter, medical, education certificates (where applicable).",
    emergencyContact: "High Commission of India Singapore: +65-62376777",
  },
  {
    code: "DE", name: "Germany",
    embassyPhone: "+49-30-25795-0", embassyEmail: "consular.berlin@mea.gov.in", embassyWebsite: "https://www.indianembassyberlin.gov.in",
    visaTimelineDays: 90,
    minWageNote: "National minimum wage €12.41/hour (2024). Most skilled roles pay well above this.",
    laborLawSummary: "Strong EU labour protections. 20 days minimum paid leave. Weekly working time capped at 48 hrs. Parental + sick leave statutorily protected.",
    costOfLivingNote: "Munich/Frankfurt expensive; Tier-2 cities cheaper. Overall 3–4x Himachal but wages scale accordingly.",
    climateNote: "Cold winter (−5°C at times); warm summer (mid-20s°C).",
    entryRequirements: "Passport, skilled-worker visa under Skilled Immigration Act, recognition of Indian qualifications (ZAB check for engineers/health), German A2/B1 depending on role.",
    emergencyContact: "Embassy of India Berlin: +49-30-25795-0",
  },
  {
    code: "GB", name: "United Kingdom",
    embassyPhone: "+44-20-78368484", embassyEmail: "hoc.london@hcilondon.in", embassyWebsite: "https://www.hcilondon.gov.in",
    visaTimelineDays: 60,
    minWageNote: "National Living Wage £11.44/hour (age 21+, April 2024). Health & Care Worker visa has a separate salary threshold.",
    laborLawSummary: "Employment Rights Act 1996 + statutory minimum wage. 28 days paid leave typical. Strong unfair-dismissal protections after 2 years.",
    costOfLivingNote: "London very expensive; rest of UK more manageable. Roughly 3x Himachal depending on region.",
    climateNote: "Cold + damp winter; mild summer.",
    entryRequirements: "Sponsored Skilled Worker visa via licensed sponsor, CoS + English (IELTS B1), TB test (India is a listed country).",
    emergencyContact: "High Commission of India London: +44-20-78368484",
  },
  {
    code: "CA", name: "Canada",
    embassyPhone: "+1-613-7443751", embassyEmail: "hoc.ottawa@mea.gov.in", embassyWebsite: "https://www.hciottawa.gov.in",
    visaTimelineDays: 90,
    laborLawSummary: "Provincial labour codes (Ontario, BC, Alberta etc). Minimum wage varies by province (~CAD 16–17/hour). Strong worker protections + EI benefits.",
    costOfLivingNote: "Toronto/Vancouver expensive; smaller provinces cheaper. Overall ~3–4x Himachal.",
    climateNote: "Cold winters (−20°C or lower in some provinces). Requires serious winter clothing.",
    entryRequirements: "LMIA-backed work permit or Express Entry. Medical exam, police clearance, IELTS.",
    emergencyContact: "High Commission of India Ottawa: +1-613-7443751",
  },
  {
    code: "AU", name: "Australia",
    embassyPhone: "+61-2-62733999", embassyEmail: "hoc.canberra@mea.gov.in", embassyWebsite: "https://www.hciindia.gov.in",
    visaTimelineDays: 75,
    minWageNote: "National minimum wage AUD 915.90/week (40h, July 2024). Award rates higher for skilled trades.",
    laborLawSummary: "Fair Work Act 2009 + Modern Awards. 4 weeks paid annual leave + 10 days personal leave. Superannuation (pension) contribution ~11% by employer.",
    costOfLivingNote: "Sydney/Melbourne expensive; regional cheaper. Overall 3x+ Himachal.",
    climateNote: "Seasons inverted from northern hemisphere. Summers hot; bushfires common Oct–Feb.",
    entryRequirements: "Skilled visa (189/190/491) or Employer-Sponsored (482/494). Skills assessment, IELTS, medical, police clearance.",
    emergencyContact: "High Commission of India Canberra: +61-2-62733999",
  },
  {
    code: "JP", name: "Japan",
    embassyPhone: "+81-3-32622391", embassyEmail: "hoc.tokyo@mea.gov.in", embassyWebsite: "https://www.indembassy-tokyo.gov.in",
    visaTimelineDays: 60,
    minWageNote: "Regional minimum wage (JPY 900–1,100/hour typical). Trades/IT generally well above.",
    laborLawSummary: "Labour Standards Act. 40-hour work week; overtime pay mandatory. Paid leave accrues with service length.",
    costOfLivingNote: "Tokyo/Osaka expensive; rural less so. Overall 2.5–3x Himachal.",
    climateNote: "4 distinct seasons; monsoon June–July; snow in north.",
    entryRequirements: "Specified Skilled Worker (SSW) category requires JLPT N4/N5 + skill test. Passport, medical, police clearance, Certificate of Eligibility (CoE).",
    emergencyContact: "Embassy of India Tokyo: +81-3-32622391",
  },
  {
    code: "IL", name: "Israel",
    embassyPhone: "+972-3-5291999", embassyEmail: "hoc.telaviv@mea.gov.in", embassyWebsite: "https://www.indembassyisrael.gov.in",
    visaTimelineDays: 45,
    minWageNote: "National minimum wage ILS 5,571.75/month (2024). Construction / caregiving sectors have separate MoU with India.",
    laborLawSummary: "Hours of Work and Rest Law. Max 42 hrs/week. Overtime 125% first 2 hrs, 150% thereafter. Severance pay mandatory.",
    costOfLivingNote: "Tel Aviv very expensive; overall ~2.5–3x Himachal.",
    climateNote: "Hot dry summer, mild winter. Shabbat weekend (Fri evening – Sat evening).",
    entryRequirements: "B/1 work visa via bilateral agreement, police clearance, medical.",
    emergencyContact: "Embassy of India Tel Aviv: +972-3-5291999",
  },
  {
    code: "US", name: "United States of America",
    embassyPhone: "+1-202-9397000", embassyEmail: "hoc.washington@mea.gov.in", embassyWebsite: "https://www.indianembassyusa.gov.in",
    visaTimelineDays: 90,
    minWageNote: "Federal minimum wage USD 7.25/hour; state/city minimums often much higher (e.g. CA USD 16). H-1B/H-2B roles set much higher prevailing wages.",
    laborLawSummary: "Fair Labor Standards Act (federal) + state laws. 'At-will' employment doctrine. Overtime pay beyond 40 hrs/week for non-exempt roles.",
    costOfLivingNote: "Huge variance by state. Coastal metros 4x+ Himachal; smaller states 2–3x.",
    climateNote: "Highly variable by region. Research your specific destination.",
    entryRequirements: "H-1B / H-2B / EB-series. Petition approval + DS-160 + interview at US consulate. Police clearance + medical.",
    emergencyContact: "Embassy of India Washington DC: +1-202-9397000",
  },
];

export async function seedCountryInfo(): Promise<void> {
  const db = storage.db;
  if (!db) return;
  let inserted = 0;
  for (const c of DEFAULTS) {
    const [existing] = await db.select().from(countryInfo).where(eq(countryInfo.code, c.code)).limit(1);
    if (existing) continue;
    await db.insert(countryInfo).values(c as any);
    inserted++;
  }
  logger.info(`Country info: ${inserted} seeded, ${DEFAULTS.length - inserted} already present`);
}
