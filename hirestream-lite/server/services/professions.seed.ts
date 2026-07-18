/**
 * Profession requirements — UAT-05 Item 21.
 *
 * "The portal should incorporate profession-specific mandatory educational
 *  qualifications and supporting documents based on the profession(s)/skill(s)
 *  selected by the candidate ... The list ... should be configurable by the
 *  administrator, enabling HPSEDC to add, modify, or update profession-specific
 *  eligibility criteria without requiring changes to the application."
 *      — HPSEDC, 16-07-2026
 *
 * This seed is the STARTING POINT ONLY. Once a row exists in the DB, the admin
 * screen owns it — reseeding never overwrites an edited row (see seedProfessions).
 * That is the whole point of Item 21: HPSEDC changes eligibility, not us.
 *
 * ── Why this is a table and not a rule engine ───────────────────────────────
 * HPSEDC's Driver example ("valid Driving Licence (appropriate vehicle class)",
 * "badge/commercial licence ... where applicable") reads like conditional logic.
 * It isn't. The required DOCUMENT is a licence whatever the class, so class is a
 * field inside the add-on block, not a rule — and "where applicable" is an
 * optionalDoc. Every apparent conditional collapses into a field or a row.
 *
 * ── The two list sizes are deliberately different ───────────────────────────
 * 19 professions in the picker, 5 with add-on blocks. A long picker is cheap (a
 * grid of tiles, one tap) and a short one is expensive — if a candidate can't
 * find their trade they pick "Other" and the row becomes unmatchable. Add-on
 * blocks are the costly part, so only the 5 HPSEDC named have them. Adding a
 * 6th costs HPSEDC ten minutes in the admin screen, not a release.
 *
 * ── Document keys ──────────────────────────────────────────────────────────
 * requiredDocs/optionalDocs below use the UNIFIED vocabulary. Several keys
 * (nursing_council_registration, driving_licence, iti_certificate, trade_test)
 * are NOT yet in the upload whitelist at server/routes/document.routes.ts:40 —
 * uploading them 400s today. That is expected at this stage: this push builds
 * registration (stage 1), and documents are stage 2 (page 5, on shortlist).
 * The whitelist unification lands with page 5. Config data seeded now is inert
 * until then, which is why seeding it early is safe.
 */

import { storage } from "../storage";
import { professionRequirements } from "@shared/schema";
import { logger } from "../config/logger.config";

export interface ProfessionSeed {
  professionKey: string;
  /** Bridge to jobs.category. A LIST: one trade is filed under several. */
  jobCategoryKeys: string[];
  label: string;
  labelHi: string;
  displayOrder: number;
  hasAddonBlock: boolean;
  /** Any ONE satisfies the profession. Rendered as a dropdown, never free text. */
  qualifications?: string[];
  skillsOptions?: string[];
  requiredDocs?: string[];
  optionalDocs?: string[];
  candidateNote?: string;
  candidateNoteHi?: string;
}

/**
 * The 5 professions HPSEDC named on 16-07-2026, each with an add-on block.
 *
 * DO NOT remove these without coordinating with HPSEDC — they are named in the
 * UAT-05 email and testers will check each one appears. (Same convention as
 * HPSEDC_REQUIRED_CATEGORIES in job-categories.seed.ts.)
 *
 * Note Nurse and Caregiver are SEPARATE rows though HPSEDC's email has a
 * "Caregiver/Nurse" bullet. They are not the same job: a nurse holds a 3-4 year
 * qualification plus a mandatory State Nursing Council registration (a licence
 * to practise); a caregiver holds a 3-6 month training certificate and no
 * licence. Merging them would either force Council registration on caregivers —
 * destroying the largest low-barrier Gulf funnel — or let unlicensed "nurses"
 * reach an employer and be rejected at the licensing stage, burning a placement.
 * The email's caregiver bullet asks for "relevant caregiver training", i.e. it
 * describes the caregiver row; the slash was drafting shorthand.
 */
export const HPSEDC_NAMED_PROFESSIONS: ProfessionSeed[] = [
  {
    professionKey: "nurse",
    jobCategoryKeys: ["healthcare"],
    label: "Nurse",
    labelHi: "नर्स",
    displayOrder: 10,
    hasAddonBlock: true,
    qualifications: ["GNM", "B.Sc. Nursing", "Post Basic B.Sc. Nursing", "Other nursing qualification"],
    skillsOptions: ["ICU", "Operation Theatre", "Emergency", "Paediatric", "Dialysis", "Geriatric", "General Ward"],
    requiredDocs: ["nursing_certificate", "nursing_council_registration"],
    optionalDocs: ["experience_certificate"],
    candidateNote: "You will need a recognised nursing qualification (GNM / B.Sc. Nursing / Post Basic B.Sc.) and a valid Nursing Council registration.",
    candidateNoteHi: "आपके पास मान्यता प्राप्त नर्सिंग योग्यता (GNM / B.Sc. Nursing / Post Basic B.Sc.) और वैध नर्सिंग काउंसिल पंजीकरण होना चाहिए।",
  },
  {
    professionKey: "caregiver",
    jobCategoryKeys: ["caregiver", "healthcare"],
    label: "Caregiver",
    labelHi: "देखभालकर्ता",
    displayOrder: 20,
    hasAddonBlock: true,
    qualifications: ["General Duty Assistant (GDA)", "Caregiver training certificate", "Home health aide", "No certificate yet"],
    skillsOptions: ["Elderly care", "Child care", "Disabled care", "Post-surgical care", "Dementia care", "Bedridden patient care"],
    requiredDocs: [],
    optionalDocs: ["training_certificate", "experience_certificate"],
    candidateNote: "Caregiver training is not always required, but a certificate improves your chances. No Nursing Council registration is needed.",
    candidateNoteHi: "देखभालकर्ता प्रशिक्षण हमेशा आवश्यक नहीं है, लेकिन प्रमाणपत्र से आपके अवसर बेहतर होते हैं। नर्सिंग काउंसिल पंजीकरण की आवश्यकता नहीं है।",
  },
  {
    professionKey: "driver",
    jobCategoryKeys: ["driver", "warehouse_worker"],
    label: "Driver",
    labelHi: "ड्राइवर",
    displayOrder: 30,
    hasAddonBlock: true,
    // No `qualifications`: driving needs a LICENCE, not a course. An empty list
    // is meaningful here — it tells the qualifications page to render the
    // add-on block without a qualification dropdown above it.
    qualifications: [],
    skillsOptions: ["School bus", "Tanker", "Trailer", "Forklift", "Crane", "Taxi", "Delivery van", "Heavy truck"],
    requiredDocs: ["driving_licence"],
    optionalDocs: ["badge_licence", "experience_certificate"],
    candidateNote: "You will need a valid driving licence of the right vehicle class. A badge / commercial licence is needed for some jobs.",
    candidateNoteHi: "आपके पास सही वाहन श्रेणी का वैध ड्राइविंग लाइसेंस होना चाहिए। कुछ नौकरियों के लिए बैज / कमर्शियल लाइसेंस आवश्यक है।",
  },
  {
    professionKey: "electrician",
    jobCategoryKeys: ["electrician", "technician", "construction_worker"],
    label: "Electrician",
    labelHi: "इलेक्ट्रीशियन",
    displayOrder: 40,
    hasAddonBlock: true,
    qualifications: ["ITI — Electrician", "Diploma — Electrical Engineering", "Other recognised trade qualification"],
    skillsOptions: ["Domestic wiring", "Industrial", "Panel wiring", "HVAC", "Motor winding", "Cabling"],
    requiredDocs: ["iti_certificate"],
    optionalDocs: ["experience_certificate"],
    candidateNote: "You will need a valid ITI / Diploma in the Electrician trade, or an equivalent recognised qualification.",
    candidateNoteHi: "आपके पास इलेक्ट्रीशियन ट्रेड में वैध ITI / डिप्लोमा, या समकक्ष मान्यता प्राप्त योग्यता होनी चाहिए।",
  },
  {
    professionKey: "welder",
    jobCategoryKeys: ["technician", "factory_worker", "construction_worker"],
    label: "Welder",
    labelHi: "वेल्डर",
    displayOrder: 50,
    hasAddonBlock: true,
    qualifications: ["ITI — Welder", "Other trade certificate"],
    // Welding types earn their place: Gulf employers price welders by process
    // and position. A certified 6G pipe welder is a different — and far
    // scarcer — hire than a general arc welder, and today the portal cannot
    // tell them apart.
    skillsOptions: ["Arc / SMAW", "MIG / GMAW", "TIG / GTAW", "Gas welding", "6G pipe", "Structural"],
    requiredDocs: ["iti_certificate"],
    optionalDocs: ["trade_test", "experience_certificate"],
    candidateNote: "You will need an ITI certificate in Welding or an equivalent trade certification.",
    candidateNoteHi: "आपके पास वेल्डिंग में ITI प्रमाणपत्र या समकक्ष ट्रेड प्रमाणन होना चाहिए।",
  },
];

/**
 * The rest of the picker. No add-on blocks — a mason has no mandatory
 * certificate to check, and inventing one would be us legislating, not HPSEDC.
 * Every row still gets `skillsOptions`: optional, cheap, and where the matching
 * value lives.
 *
 * Reasoned from the portal's existing 18 trades (client/src/pages/simple-apply/
 * reference.tsx) plus the gaps UAT-05 Item 18 named. NOT yet validated against
 * real HP->Gulf deployment data or the eMigrate occupation taxonomy — see the
 * spec's open questions. HPSEDC can add/remove from the admin screen.
 */
export const ADDITIONAL_PROFESSIONS: ProfessionSeed[] = [
  { professionKey: "mason", jobCategoryKeys: ["construction_worker"], label: "Mason", labelHi: "राजमिस्त्री", displayOrder: 60, hasAddonBlock: false,
    skillsOptions: ["Block work", "Plastering", "Tiling", "Shuttering", "Stone work"] },
  { professionKey: "carpenter", jobCategoryKeys: ["construction_worker"], label: "Carpenter", labelHi: "बढ़ई", displayOrder: 70, hasAddonBlock: false,
    skillsOptions: ["Shuttering", "Furniture", "Finishing", "Formwork"] },
  { professionKey: "plumber", jobCategoryKeys: ["plumber", "construction_worker"], label: "Plumber", labelHi: "प्लंबर", displayOrder: 80, hasAddonBlock: false,
    skillsOptions: ["Pipe fitting", "Sanitary", "Drainage", "PPR / PVC"] },
  { professionKey: "painter", jobCategoryKeys: ["construction_worker"], label: "Painter", labelHi: "पेंटर", displayOrder: 90, hasAddonBlock: false,
    skillsOptions: ["Interior", "Exterior", "Spray painting", "Industrial coating"] },
  { professionKey: "ac_technician", jobCategoryKeys: ["technician", "construction_worker"], label: "AC & Refrigeration Technician", labelHi: "एसी और रेफ्रिजरेशन टेक्नीशियन", displayOrder: 100, hasAddonBlock: false,
    skillsOptions: ["Split AC", "Central AC", "Chiller", "Ducting", "Refrigeration"] },
  { professionKey: "mechanic", jobCategoryKeys: ["technician", "factory_worker"], label: "Mechanic / Fitter", labelHi: "मैकेनिक / फिटर", displayOrder: 110, hasAddonBlock: false,
    skillsOptions: ["Diesel", "Petrol", "Heavy vehicle", "Pipe fitting"] },
  { professionKey: "cook", jobCategoryKeys: ["hospitality_staff"], label: "Cook", labelHi: "रसोइया", displayOrder: 120, hasAddonBlock: false,
    skillsOptions: ["Indian", "Continental", "Arabic", "Chinese", "Tandoor", "Bakery"] },
  { professionKey: "waiter", jobCategoryKeys: ["hospitality_staff"], label: "Waiter / Steward", labelHi: "वेटर / स्टीवर्ड", displayOrder: 130, hasAddonBlock: false,
    skillsOptions: ["Fine dining", "Banquet", "Bar", "Barista"] },
  { professionKey: "housekeeping", jobCategoryKeys: ["hospitality_staff"], label: "Housekeeping / Cleaner", labelHi: "हाउसकीपिंग / सफाईकर्मी", displayOrder: 140, hasAddonBlock: false,
    skillsOptions: ["Hotel", "Hospital", "Industrial", "Laundry"] },
  { professionKey: "security_guard", jobCategoryKeys: ["other"], label: "Security Guard", labelHi: "सुरक्षा गार्ड", displayOrder: 150, hasAddonBlock: false,
    skillsOptions: ["CCTV", "Access control", "Fire safety", "Patrolling"] },
  { professionKey: "tailor", jobCategoryKeys: ["factory_worker"], label: "Tailor", labelHi: "दर्जी", displayOrder: 160, hasAddonBlock: false,
    skillsOptions: ["Gents", "Ladies", "Alteration", "Embroidery"] },
  { professionKey: "farm_worker", jobCategoryKeys: ["other"], label: "Farm Worker", labelHi: "खेत मजदूर", displayOrder: 170, hasAddonBlock: false,
    skillsOptions: ["Greenhouse", "Dairy", "Orchard", "Farm machinery"] },
  { professionKey: "helper", jobCategoryKeys: ["helper", "construction_worker", "warehouse_worker", "factory_worker"], label: "Helper / General Labour", labelHi: "हेल्पर / मजदूर", displayOrder: 180, hasAddonBlock: false,
    skillsOptions: [] },
  // The escape hatch. Always last, always present. A candidate who cannot find
  // their trade must still be able to register — but every "Other" is a row we
  // cannot match, so its rate is worth watching: a rising one means the picker
  // is missing a real HP trade and should gain a tile.
  { professionKey: "other", jobCategoryKeys: ["other"], label: "Other", labelHi: "अन्य", displayOrder: 999, hasAddonBlock: false,
    skillsOptions: [] },
];

export const ALL_PROFESSIONS: ProfessionSeed[] = [
  ...HPSEDC_NAMED_PROFESSIONS,
  ...ADDITIONAL_PROFESSIONS,
];

export const PROFESSION_KEYS = ALL_PROFESSIONS.map((p) => p.professionKey);

/**
 * Insert any profession that does not exist yet. Never updates an existing row.
 *
 * This is deliberate and is the load-bearing half of Item 21: the moment HPSEDC
 * edits "Nurse" in the admin screen, that row is THEIRS. A reseed on the next
 * deploy that helpfully "restored" our defaults would silently revert their
 * eligibility policy — the exact failure the "without requiring changes to the
 * application" requirement exists to prevent.
 *
 * To intentionally re-baseline a row, delete it in the admin screen and restart.
 */
export async function seedProfessions(): Promise<void> {
  const db = storage.db;
  try {
    const existing = await db.select({ key: professionRequirements.professionKey }).from(professionRequirements);
    const have = new Set(existing.map((r: { key: string }) => r.key));
    const missing = ALL_PROFESSIONS.filter((p) => !have.has(p.professionKey));

    if (missing.length === 0) {
      logger.info(`Professions: all ${have.size} already present, nothing to seed`);
      return;
    }

    await db.insert(professionRequirements).values(
      missing.map((p) => ({
        professionKey: p.professionKey,
        jobCategoryKeys: p.jobCategoryKeys,
        label: p.label,
        labelHi: p.labelHi,
        displayOrder: p.displayOrder,
        hasAddonBlock: p.hasAddonBlock,
        qualifications: p.qualifications ?? [],
        skillsEnabled: (p.skillsOptions?.length ?? 0) > 0,
        skillsOptions: p.skillsOptions ?? [],
        requiredDocs: p.requiredDocs ?? [],
        optionalDocs: p.optionalDocs ?? [],
        candidateNote: p.candidateNote ?? null,
        candidateNoteHi: p.candidateNoteHi ?? null,
        active: true,
      })) as any,
    );

    logger.info(`Professions: ${missing.length} seeded (${missing.map((p) => p.professionKey).join(", ")}), ${have.size} already present`);
  } catch (err: any) {
    // Non-fatal: a portal with no professions is broken, but crashing boot over
    // it takes down every other module too. Loud log, keep serving.
    logger.error(`Professions seed failed: ${err?.message}`);
  }
}
