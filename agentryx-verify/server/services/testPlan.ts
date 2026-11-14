/**
 * The phase-1 test run for HireStream Lite, in the order a tester follows it.
 * One story end to end: the tester posts a job, registers as a new applicant,
 * applies to that job, then plays HPSEDC and the applicant in turn until the
 * applicant is placed. Each session says which account to use and what to
 * carry into the next one. Cases carry their session number (requirements.session)
 * and plan: run (by hand) · with (checked inside another case) · auto (automation
 * proves it) · blocked (not built / waiting) · later (mobile, after the Lite app build).
 */
export type Session = { n: number; title: string; role: string; account: string; minutes: number; intro: string; carry?: string };

export const SESSIONS: Session[] = [
  { n: 1, title: "HPSEDC sets the rules", role: "Admin", account: "demo_admin", minutes: 20,
    intro: "Look around the Admin Console and the settings HPSEDC controls: professions, the application form, system settings and users. Change nothing you can't put back — note the old value before you edit." },
  { n: 2, title: "Jobs arrive and are published", role: "Admin, then Placement Cell", account: "demo_admin → hpsedc_agency", minutes: 20,
    intro: "Import a job batch as the Admin, then sign in as the Placement Cell and post one job by hand.",
    carry: "Post a job called “UAT Welder — <your name>” for the UAE, with a hiring deadline. You will apply to it in session 3." },
  { n: 3, title: "Register and apply as a new applicant", role: "Applicant (new account)", account: "Create Account with a new email", minutes: 45,
    intro: "Create a brand-new applicant — use an email like piyush.uat1@gmail.com — and fill the four-page form, then find your session-2 job and apply. Try Hindi on at least one page.",
    carry: "Remember the applicant's name and email. Every later session follows this applicant." },
  { n: 4, title: "HPSEDC reviews and invites to interview", role: "Placement Cell", account: "hpsedc_agency", minutes: 20,
    intro: "Find your applicant in the Applications Pipeline, look at the candidate pool and export, then schedule an interview for your applicant." },
  { n: 5, title: "The applicant answers the interview", role: "Applicant", account: "your session-3 applicant", minutes: 5,
    intro: "Open the interview invitation and ask to reschedule (with a reason), so HPSEDC has something to answer in session 6." },
  { n: 6, title: "HPSEDC responds and selects", role: "Placement Cell", account: "hpsedc_agency", minutes: 10,
    intro: "Answer the reschedule request, then record the outcome: Pass / Select. This creates the offer and asks the applicant for documents." },
  { n: 7, title: "The applicant sends documents", role: "Applicant", account: "your session-3 applicant", minutes: 15,
    intro: "See which documents are owed and why, upload them (a phone photo is fine), and fill 'Before you travel'." },
  { n: 8, title: "HPSEDC prepares departure", role: "Placement Cell", account: "hpsedc_agency", minutes: 10,
    intro: "Upload the appointment letter with a travel date, then record visa status and pre-departure compliance." },
  { n: 9, title: "The applicant accepts the offer", role: "Applicant", account: "your session-3 applicant", minutes: 5,
    intro: "Accept the offer. The applicant becomes Placed." },
  { n: 10, title: "After departure", role: "Placement Cell and Applicant", account: "hpsedc_agency ⇄ your applicant", minutes: 20,
    intro: "Record a welfare check-in, send an 'Ask HPSEDC' message and a grievance as the applicant, and answer them as the Placement Cell." },
  { n: 11, title: "Oversight", role: "Placement Cell, then Admin", account: "hpsedc_agency → demo_admin", minutes: 20,
    intro: "Reports, compliance, audit log, fraud watch, grievances and notification templates." },
  { n: 12, title: "Across the portal", role: "Any account", account: "as each case says", minutes: 20,
    intro: "Short checks that are not part of the story: what each role is allowed to open, old links, phone layout, the callback option, forgot password and the sign-in page." },
  { n: 13, title: "Proved by automation", role: "—", account: "—", minutes: 0,
    intro: "The automated checks prove these; you don't need to do them by hand." },
  { n: 14, title: "Not ready to test yet", role: "—", account: "—", minutes: 0,
    intro: "Not built, or waiting for something outside the portal. You'll be told when to test them." },
  { n: 20, title: "Mobile app — later", role: "Applicant (mobile)", account: "—", minutes: 0,
    intro: "These run once the mobile app is rebuilt to point at the Lite portal." },
];
