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
    { username: "arjun_thakur", name: "Arjun Thakur", subtitle: "Construction · Dubai", status: "Placed · active", tone: "green",
      photo: "/uploads/hs/candidates/photos/arjun_thakur.jpg?v=2",
      note: "The success story — pre-departure tracker complete, visa approved, appointment letter, welfare 30/60 done, 90 due." },
    { username: "priya_verma", name: "Priya Verma", subtitle: "Reg. Nurse · Germany", status: "Placed · active", tone: "green",
      photo: "/uploads/hs/candidates/photos/priya_verma.jpg?v=2",
      note: "Healthcare placement; non-ECR; IELTS 7.0; welfare 30-day check-in done." },
    { username: "rohit_sharma", name: "Rohit Sharma", subtitle: "Hotel Staff · Qatar", status: "Placed · visa rejected", tone: "red",
      photo: "/uploads/hs/candidates/photos/rohit_sharma.jpg?v=2",
      note: "Compliance flag: visa rejected — shows how HPSEDC catches a problem placement." },
    { username: "neha_chauhan", name: "Neha Chauhan", subtitle: "Housekeeping · Bahrain", status: "Placed · flagged", tone: "amber",
      photo: "/uploads/hs/candidates/photos/neha_chauhan.jpg?v=2",
      note: "Compliance flags: placed without PBBY + visa not yet approved; welfare SLA overdue." },
    { username: "karan_rana", name: "Karan Rana", subtitle: "Driver · UAE", status: "Offer issued", tone: "blue",
      photo: "/uploads/hs/candidates/photos/karan_rana.jpg?v=2",
      note: "Selected — accept the offer live from the candidate side." },
    { username: "meera_iyer", name: "Meera Iyer", subtitle: "Caregiver · Japan", status: "Interview", tone: "indigo",
      photo: "/uploads/hs/candidates/photos/meera_iyer.jpg?v=2",
      note: "Interview confirm/reschedule/decline; 88% profile (1 missing doc → verification states)." },
    { username: "vikram_negi", name: "Vikram Negi", subtitle: "Welder · Saudi Arabia", status: "Shortlisted", tone: "purple",
      photo: "/uploads/hs/candidates/photos/vikram_negi.jpg?v=2",
      note: "Appears in the employer Review Queue; carries a match score." },
    { username: "ananya_bhatt", name: "Ananya Bhatt", subtitle: "IT Support · Germany", status: "Reviewed", tone: "cyan",
      photo: "/uploads/hs/candidates/photos/ananya_bhatt.jpg?v=2",
      note: "Shows the 'Viewed' badge on the candidate's application." },
    { username: "aman_kapoor", name: "Aman Kapoor", subtitle: "Plumber · Kuwait", status: "Submitted", tone: "slate",
      photo: "/uploads/hs/candidates/photos/aman_kapoor.jpg?v=2",
      note: "Fresh applicant + a second application — multi-application tracking." },
    { username: "sahil_verma", name: "Sahil Verma", subtitle: "Electrician · Oman", status: "Rejected", tone: "red",
      photo: "/uploads/hs/candidates/photos/sahil_verma.jpg?v=2",
      note: "Rejection privacy — employer name scrubbed; rejection reason shown." },
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
