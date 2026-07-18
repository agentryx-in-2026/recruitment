/**
 * Test mode — per-page autofill for UAT.
 *
 * Filling ~18 fields by hand on page 1 before you can even SEE page 2 makes
 * testing the later pages miserable, and a tester who dreads the setup stops
 * testing the thing they were actually checking.
 *
 * ── How it is switched on, and why it cannot leak to a real candidate ───────
 * Visit any registration URL with `?test=1` once. The flag is kept in
 * sessionStorage so it survives moving between pages, and dies with the tab.
 * There is no setting, no build flag and no server involvement — a real
 * applicant cannot reach this without deliberately typing the parameter, and
 * even then it only fills THEIR OWN form with obvious placeholder data.
 *
 * `?test=0` turns it off again.
 */

const KEY = "hs_reg_test_mode";

/**
 * UAT hosts where the toggle is offered without anyone having to know the URL
 * parameter. It still does not switch test mode ON by itself — it only makes the
 * discreet "Test mode" toggle VISIBLE on the sign-in page, so a tester can turn
 * it on with a click. Any host not in this list behaves exactly as before, which
 * is how a production deployment stays clean.
 */
const UAT_HOSTS = ["hirestream-lite.agentryx.dev", "localhost", "127.0.0.1"];

export function isTestModeOfferable(): boolean {
  if (typeof window === "undefined") return false;
  return UAT_HOSTS.some((h) => window.location.hostname === h || window.location.hostname.endsWith(`.${h}`));
}

/** Turn test mode on or off explicitly (the sign-in page toggle). */
export function setTestMode(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

export function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get("test");
  if (param === "1") { try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode */ } return true; }
  if (param === "0") { try { sessionStorage.removeItem(KEY); } catch { /* noop */ } return false; }
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Sample data. Deliberately obvious as test data (name, email) so a row that
 * escapes into a real database is recognisable at a glance.
 *
 * The Aadhaar is REAL-SHAPED: 234567890124 passes the Verhoeff checksum. A
 * random 12 digits would be rejected by the very validation this is meant to
 * help test, and the tester would think autofill was broken.
 */
export const TEST_DATA = {
  page1: {
    passportNumber: "Z9876543",
    passportIssueDate: "2021-04-12",
    passportExpiry: "2031-04-11",
    passportPlaceOfIssue: "Shimla",
    ecrStatus: "ecnr",
    aadhaarNumber: "234567890124",
    fullName: "Test Candidate (autofill)",
    dateOfBirth: "1996-08-14",
    sex: "male",
    fatherName: "Test Father",
    motherName: "Test Mother",
    disabilityStatus: "no",
    disabilityType: "",
    phone: "+91 9876500011",
    whatsappSame: true,
    whatsappNumber: "",
    email: "test.candidate@example.com",
    homeTown: "Theog",
    pAddr1: "Village Kotkhai, Near Bus Stand",
    pAddr2: "",
    pDistrict: "Shimla",
    pState: "Himachal Pradesh",
    pPin: "171201",
    corrSame: true,
  },
  page2: {
    // Two trades, one WITH an add-on block (welder) and one without (mason), so
    // page 3 exercises both branches in a single pass.
    professionKeys: ["welder", "mason"],
    languages: [
      { language: "Hindi", proficiency: "native" },
      { language: "English", proficiency: "intermediate" },
    ],
  },
  page3: {
    eduLevel: "iti",
    eduBoard: "HPBOSE",
    eduInstitution: "ITI Shimla",
    eduYear: 2016,
    eduPassed: true,
    /** Keyed by professionKey; only the blocks that exist are used. */
    addon: {
      welder: { qualification: "ITI — Welder", institution: "ITI Shimla", year: 2016, tradeTestPassed: true },
      nurse: {
        qualification: "B.Sc. Nursing", institution: "IGMC Shimla", year: 2018,
        councilRegNumber: "HP-2018-0099", councilName: "HP Nursing Registration Council",
      },
      driver: { licenceNumber: "HP0120210099999", licenceClass: "HMV", licenceValidUntil: "2032-01-01", badgeHeld: true },
      electrician: { qualification: "ITI — Electrician", institution: "ITI Shimla", year: 2016, certBody: "NCVT" },
      caregiver: { qualification: "General Duty Assistant (GDA)", institution: "NSDC Centre Shimla", year: 2019, courseMonths: 6 },
    } as Record<string, Record<string, any>>,
    experienceMonths: 60,
    lastEmployerName: "Test Constructions Pvt Ltd",
    lastEmployerCountry: "India",
  },
};
