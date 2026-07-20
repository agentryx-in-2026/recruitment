/**
 * Demo cast roster — the single source of truth for the curated demo dataset.
 *
 * Used by BOTH:
 *   - the Demo Panel + floating Demo Switcher (client) — to render one-click logins
 *   - scripts/seed.ts (server) — to know which accounts/statuses to build
 *
 * Gated by the `feature.quick_login_enabled` flag (off in production), so listing
 * demo usernames here is safe — it never ships to a live deployment.
 *
 * Keep `username` values in sync with scripts/seed.ts. All demo passwords are `test123`.
 */

export type DemoTab = "candidates" | "agencies" | "employers" | "admin";

export type DemoTone =
  | "green"   // placed / approved — success
  | "amber"   // pending / attention
  | "red"     // problem / flagged
  | "blue"    // offer / selected
  | "indigo"  // interview
  | "purple"  // shortlisted
  | "cyan"    // reviewed
  | "slate";  // submitted / neutral

export interface DemoCastMember {
  username: string;
  name: string;
  subtitle: string;   // candidates: "Trade · Country" · orgs: "Sector · Base"
  status: string;     // short badge text shown on the card
  tone: DemoTone;
  photo?: string;     // candidates only — /uploads/hs/candidates/photos/<file>
  note: string;       // "what to show here" — presenter hint (tooltip)
}

export const DEMO_TAB_LABELS: Record<DemoTab, string> = {
  candidates: "Candidates",
  agencies: "Agencies",
  employers: "Employers",
  admin: "Admin",
};

export const DEMO_CAST: Record<DemoTab, DemoCastMember[]> = {
  candidates: [
    // Reseeded 2026-07-19 to the current architecture. The previous roster
    // pointed at 25 accounts the reseed deleted, so every card here was a dead
    // login. Statuses use the DIRECT pipeline (Applied -> Interview -> Selected
    // -> Placed) — there is no Shortlisted or Reviewed under phase 1.
    { username: "demo_candidate", name: "Demo Candidate", subtitle: "New applicant", status: "Empty profile", tone: "slate",
      note: "Deliberately empty — signing in lands on the fresh 4-page registration form. This is the item-2/3 walkthrough." },
    { username: "kishori_lal", name: "Kishori Lal", subtitle: "Cook · Qatar", status: "Selected · docs complete", tone: "green",
      note: "Every required document uploaded and verified — the clean 'ready to deploy' card." },
    { username: "nirmala_devi", name: "Nirmala Devi", subtitle: "Staff Nurse · UAE", status: "Selected · docs outstanding", tone: "blue",
      note: "Item 21 in action: asked for Nursing Council registration and a nursing certificate on top of the base set." },
    { username: "om_prakash", name: "Om Prakash", subtitle: "Electrician · Saudi Arabia", status: "Selected · docs outstanding", tone: "blue",
      note: "Profession AND country rules together — ITI certificate plus a Saudi trade test." },
    { username: "suresh_thakur", name: "Suresh Thakur", subtitle: "Heavy Truck Driver · UAE", status: "Selected · offer open", tone: "blue",
      note: "HMV licence with a badge; accept the offer live from the candidate side." },
    { username: "rakesh_verma", name: "Rakesh Verma", subtitle: "Welder · UAE", status: "Placed · active", tone: "green",
      note: "Deployed 70 days ago; welfare 30 and 60-day check-ins done, 90 due." },
    { username: "anita_kumari", name: "Anita Kumari", subtitle: "Caregiver · UAE", status: "Placed · active", tone: "green",
      note: "Gulf returnee, Arabic speaker; 30-day welfare check-in done." },
    { username: "kamlesh_kumar", name: "Kamlesh Kumar", subtitle: "Construction Helper · Oman", status: "Placed · welfare due", tone: "amber",
      note: "Deployed 20 days ago — the 30-day welfare check is coming due, so this one drives the welfare queue." },
    { username: "shalini_rathore", name: "Shalini Rathore", subtitle: "ICU Nurse · Germany", status: "Interview scheduled", tone: "indigo",
      note: "Non-ECR nurse; interview pending confirmation." },
    { username: "mohan_lal", name: "Mohan Lal", subtitle: "Mason · UAE", status: "Interview confirmed", tone: "indigo",
      note: "15 years on site, 8th pass — the low-literacy blue-collar case the minimal dashboard is built for." },
    { username: "vijay_katoch", name: "Vijay Katoch", subtitle: "Plumber · Qatar", status: "Interview · reschedule asked", tone: "amber",
      note: "Has requested a reschedule — shows the candidate-side interview response flow." },
    { username: "babita_thakur", name: "Babita Thakur", subtitle: "Caregiver · UAE", status: "Applied · no passport", tone: "slate",
      note: "Ticked 'I do not have a passport yet' — allowed to apply, blocked at selection. Item 4's escape hatch." },
    { username: "geeta_bhandari", name: "Geeta Bhandari", subtitle: "Tailor · UAE", status: "Applied", tone: "slate",
      note: "Declared a disability (item 12) and has no passport yet." },
    { username: "tek_chand", name: "Tek Chand", subtitle: "Mason · UAE", status: "Rejected after interview", tone: "red",
      note: "Carries written rejection feedback the candidate can read." },
  ],
  agencies: [
    { username: "europe_careers", name: "Europe Careers Pvt. Ltd.", subtitle: "Healthcare · IT · Europe & Japan", status: "Approved", tone: "green",
      note: "Operating agency — pick-up, scrutiny, shortlist, interviews, placement + welfare." },
    { username: "gulf_jobs_direct", name: "Gulf Jobs Direct", subtitle: "Construction · Trades · Gulf", status: "Approved", tone: "green",
      note: "Operating agency — the Gulf pipeline; MEA documents on file." },
    { username: "himalayan_overseas", name: "Himalayan Overseas Consultants", subtitle: "Multi-sector · Shimla", status: "Pending approval", tone: "amber",
      note: "All 9 MEA docs uploaded, awaiting HPSEDC approval → demo the approve flow." },
    { username: "pioneer_manpower", name: "Pioneer Manpower Services", subtitle: "Trades · Mandi", status: "Pending approval", tone: "amber",
      note: "Docs uploaded, awaiting approval → second approval / reject path." },
    { username: "shivalik_overseas", name: "Shivalik Overseas Recruiters", subtitle: "Oil & Gas · Construction · Bilaspur", status: "Top performer", tone: "green",
      note: "TOP-3 agency — most jobs & placements. Open the Leaderboard to show it ranking high." },
    { username: "himachal_manpower", name: "Himachal Manpower Exports", subtitle: "Construction · Hospitality · Solan", status: "Approved", tone: "green",
      note: "Established approved agency with a healthy pipeline." },
    { username: "dhauladhar_staffing", name: "Dhauladhar Staffing Solutions", subtitle: "Healthcare · Hospitality · Kangra", status: "Approved", tone: "green",
      note: "Approved agency sourcing healthcare/hospitality roles." },
    { username: "apex_global_hr", name: "Apex Global HR Consultants", subtitle: "IT · Engineering · Shimla", status: "Approved", tone: "green",
      note: "Approved agency focused on IT/engineering." },
    { username: "summit_overseas", name: "Summit Overseas Placements", subtitle: "Hospitality · Construction · Mandi", status: "Approved", tone: "green",
      note: "Newer approved agency, smaller pipeline — contrasts with the top performers." },
    { username: "greenvalley_recruiters", name: "Green Valley Recruiters", subtitle: "Construction · Transport · Una", status: "Pending approval", tone: "amber",
      note: "Third pending agency — extra approve/reject material." },
  ],
  employers: [
    { username: "almansoori_uae", name: "Al-Mansoori Construction LLC", subtitle: "Construction/trades · Dubai", status: "Approved", tone: "green",
      note: "Approved foreign principal — posts requisitions; review queue; approve-for-interview." },
    { username: "sakura_care", name: "Sakura Care & Staffing Group", subtitle: "Healthcare/hospitality · Japan & Germany", status: "Approved", tone: "green",
      note: "Approved employer hosting the healthcare/IT requisitions." },
    { username: "gulf_premier", name: "Gulf Premier Hospitality LLC", subtitle: "Hospitality · Qatar", status: "Pending approval", tone: "amber",
      note: "Company docs uploaded, awaiting HPSEDC approval → demo approve." },
    { username: "nippon_labour", name: "Nippon Skilled Labour Co.", subtitle: "Trades · Japan", status: "Pending approval", tone: "amber",
      note: "Awaiting approval → reject/approve demo." },
    { username: "riyadh_petrotech", name: "Riyadh PetroTech Industries", subtitle: "Oil & Gas · Saudi Arabia", status: "Approved", tone: "green",
      note: "Big approved principal — posts many trades roles sourced by the top agencies." },
    { username: "kuwait_build", name: "Kuwait National Build Co.", subtitle: "Construction · Kuwait", status: "Approved", tone: "green",
      note: "Approved construction principal in Kuwait." },
    { username: "emirates_facilities", name: "Emirates Facilities Management LLC", subtitle: "Facilities · Dubai", status: "Approved", tone: "green",
      note: "Approved FM/hospitality principal in Dubai." },
    { username: "doha_hospitality", name: "Doha Hospitality Group", subtitle: "Hospitality · Qatar", status: "Approved", tone: "green",
      note: "Approved hospitality principal in Qatar." },
    { username: "bavaria_klinik", name: "Bavaria Klinik Verbund", subtitle: "Healthcare · Germany", status: "Approved", tone: "green",
      note: "Approved German healthcare principal — nursing/caregiver roles." },
    { username: "muscat_marine", name: "Muscat Marine Services LLC", subtitle: "Marine · Trades · Oman", status: "Pending approval", tone: "amber",
      note: "Third pending employer — extra approve/reject material." },
  ],
  admin: [
    { username: "demo_admin", name: "HPSEDC Officer", subtitle: "Government Authority", status: "Authority", tone: "red",
      note: "The regulator — verification queues, compliance, welfare SLA, audit log, system config." },
  ],
};
