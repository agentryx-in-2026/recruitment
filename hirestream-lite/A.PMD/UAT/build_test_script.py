#!/usr/bin/env python3
"""
Builds the HireStream Lite UAT test script (HTML) from the live case list in
Agentryx Verify, so the script always matches what the tester marks there.

    python3 build_test_script.py            # writes Lite_UAT_Test_Script.html next to this file
    python3 build_test_script.py --sync     # also writes each tip into its case in Verify (shown on the case page)

Case wording comes from Verify (requirements table). Session titles mirror
agentryx-verify/server/services/testPlan.ts. The extra per-case data and tips
live in TIPS below — edit them here, then rebuild.
"""
import html, json, os, re, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY_ENV = os.path.join(HERE, "../../../agentryx-verify/.env")
PROJECT = "hirestream-lite"

SESSIONS = {
  1: ("HPSEDC sets the rules", "Admin", "demo_admin", 20,
      "Look around the Admin Console and the settings HPSEDC controls. Before you change anything, note the old value, and put it back when the case is done."),
  2: ("Jobs arrive and are published", "Admin, then Placement Cell", "demo_admin → hpsedc_agency", 20,
      "Import a job batch as the Admin, then sign in as the Placement Cell, post one job by hand and create a recruitment drive."),
  3: ("Register and apply as a new applicant", "Applicant (new account)", "a new account with your own email", 45,
      "Create a brand-new applicant, fill the four-page form, confirm the email with the code that arrives, then find your session-2 job and apply. Use the test data card above."),
  4: ("HPSEDC reviews and invites to interview", "Placement Cell", "hpsedc_agency", 20,
      "Find your applicant in the Applications Pipeline, look at the candidate pool and the exports, then schedule an interview for your applicant."),
  5: ("The applicant answers the interview", "Applicant", "your session-3 applicant", 5,
      "Open the interview invitation and ask to reschedule (with a reason), so HPSEDC has something to answer in session 6."),
  6: ("HPSEDC responds and selects", "Placement Cell", "hpsedc_agency", 10,
      "Answer the reschedule request, then record the outcome Pass / Select. This creates the offer and asks the applicant for documents."),
  7: ("The applicant sends documents", "Applicant", "your session-3 applicant", 15,
      "See which documents are owed and why, upload them, and fill 'Before you travel'."),
  8: ("HPSEDC prepares departure", "Placement Cell", "hpsedc_agency", 10,
      "Upload the appointment letter with a travel date, then record visa status and pre-departure compliance."),
  9: ("The applicant accepts the offer", "Applicant", "your session-3 applicant", 5,
      "Accept the offer. The applicant becomes Placed."),
  10: ("After departure", "Placement Cell and Applicant", "hpsedc_agency ⇄ your applicant", 20,
      "Record a welfare check-in, send an 'Ask HPSEDC' message and a grievance as the applicant, and answer them as the Placement Cell."),
  11: ("Oversight", "Placement Cell, then Admin", "hpsedc_agency → demo_admin", 20,
      "Reports, compliance, audit log, fraud watch, grievances and notification templates."),
  12: ("Across the portal", "Any account", "as each case says", 20,
      "Short checks outside the story: what each role may open, old links, phone layout, the callback option, forgot password, the sign-in page and the FAQ."),
}

CARRY = {
  2: "You need the job “UAT Welder — Piyush” in session 3. Don't close or delete it.",
  3: "Write down the applicant's email and password. Sessions 5, 7, 9 and 10 sign in as this applicant.",
  4: "Your applicant now has an interview.",
  6: "Your applicant is now Selected and has an offer.",
  8: "The appointment letter is uploaded — the applicant can now accept.",
  9: "Your applicant is now Placed.",
}

# Extra data / tips per case, shown under the steps.
TIPS = {
  "L4.1": "Download all the CSVs in the dark header bar and open one in Excel — it should have rows, not just headings.",
  "L4.3": "Before editing, copy the current Welder note somewhere. Use “UAT note — Piyush” as the new text. To see the applicant side, open a private (incognito) window and sign in as <b>demo_candidate</b> / test123. Put the note back and show the trade again when done.",
  "L4.4": "Check the form as <b>demo_candidate</b> in a private window. Put every field back as it was when done.",
  "L4.5": "Only toggle the setting, save, check the Audit Log, and toggle it back on. The apply behaviour itself is tested in session 3 (L1.14).",
  "L4.6": "Use the seeded applicant <b>rakesh_verma</b> (password test123). Try to sign in as him in a private window while disabled, then enable him again.",
  "L4.2": "Use the file <b>Ministry job batch (demo file)</b> from Verify → Key documents. It has 6 rows; the Electrician row has no country on purpose. Expect 5 jobs imported and 1 error.",
  "L2.1": "hpsedc_agency is the HPSEDC Placement Cell. Password test123.",
  "L2.2": "Title <b>UAT Welder — Piyush</b> · Country United Arab Emirates · City Dubai · Category Welder (or Construction) · Salary AED 2,500 fixed · Experience 2 years · Hiring deadline 31 Dec 2026. For the draft, use the title <b>UAT Draft — Piyush</b>.",
  "L2.3": "Try Close / Reopen / Delete on <b>UAT Draft — Piyush</b>, never on UAT Welder — Piyush (you apply to it in session 3).",
  "L2.15": "Title <b>UAT Drive — Piyush</b> · a date next week · Location Shimla · Target trade Welder.",
  "L1.1": "Use the test data card: name, the +uat1 email, password Test@2026.",
  "L1.4": "Aadhaar: first <b>234567890123</b> (must be refused), then <b>234567890124</b> (accepted). Passport expiry: first 01/01/2024 (refused), then 31/12/2031. PIN: first 17100 (refused), then 171001. Never enter a real Aadhaar or passport number.",
  "L1.5": "Tick the box, check the note, then untick it again and enter the passport from the data card (later sessions need it).",
  "L1.6": "Mobile +971 501234567. WhatsApp: untick 'Same as mobile' and enter +91 9876500000.",
  "L1.7": "Pick Welder, Driver, Nurse, then try a 4th (Electrician) — it must be refused.",
  "L1.9": "Driver and Nurse are already picked from L1.7, so their extra question cards appear on page 3.",
  "L1.11": "This is the first Submit for this account — exactly the moment the old bug (L6.1) happened.",
  "L1.12": "The code goes to your +uat1 address, which lands in your normal Gmail inbox. Check Spam the first time and mark it 'Not spam'.",
  "L1.13": "Search 'welder' — your UAT Welder — Piyush job should be in the results.",
  "L1.14": "First try Apply before you have confirmed the email (do L1.12 after this if you like), then apply to <b>UAT Welder — Piyush</b>, then apply to it again.",
  "L2.5": "Search for your applicant's name.",
  "L2.14": "Contact buttons open your mail / phone app — you don't need to send anything.",
  "L2.4": "Use your UAT Welder — Piyush job — the export should contain your applicant.",
  "L2.6": "Schedule your applicant: a date 3 days ahead, 10:00, In person, Shimla office, interviewer “UAT Panel”. Then try Virtual with the link left empty — it must not submit.",
  "L1.16": "With one applicant you have one interview, so do <b>Reschedule</b> with the reason “UAT — clash with exam” (session 6 needs it) and download the calendar (.ics) file. If you also want to try Confirm and Decline, mark the case Partial and say which you could test.",
  "L2.7": "Answer your applicant's request by proposing a new time. Note in the comment which options you could try.",
  "L2.8": "Pass / Select <b>your applicant</b> with rating 4. For Fail / Reject, use one of the seeded applicants already at Interview — first without notes (must be refused), then with notes.",
  "L1.17": "Sign in as your applicant. You'll see the 'Documents needed' card on the dashboard.<br><b>Also look now, for L1.20 (session 9):</b> HPSEDC hasn't uploaded the appointment letter yet, so the offer should say it is waiting for the letter, with no Accept button and no offer-letter PDF (only Decline). Note what you see.",
  "L1.18": "Any small PDF works (e.g. print a web page to PDF). For the size check, use any file larger than 5 MB.",
  "L1.19": "PBBY policy number: UAT-PBBY-0001.",
  "L2.9": "Any PDF works as the signed letter. Travel date: 30 days ahead. Skip the ECR part if your applicant isn't marked ECR, and say so in the comment.",
  "L2.10": "Visa note: “UAT — submitted to embassy”.",
  "L6.8": "Use the documents your applicant uploaded in session 7. Verify one; for another, ask for a new copy with the reason “UAT — page is blurred”. Then sign in as your applicant: the bell shows both messages, and Documents shows the verified one as accepted. Upload a new copy of the other if you like — it goes back to HPSEDC for checking.",
  "L1.20": "Use what you saw in session 7 for the 'before the letter' part. This is the fix for your finding <b>FB-2026-0021</b> (15 Nov): before the letter there is no Accept and no offer PDF, just a note saying why. After you check it, confirm the fix on FB-2026-0021 in Findings too. Skip Decline (it would undo your story) unless you have a second selected applicant.",
  "L2.11": "Note: “UAT — called, settled in well”.",
  "L1.21": "Message: “UAT — when is my flight?”. Grievance category 'Someone asked me for money', text “UAT test — please ignore”.",
  "L1.22": "Change the password to Test@2027, sign out and sign back in with it. Write the new password down.",
  "L4.8": "The Duplicates part needs two accounts sharing a phone — if there are none, mark Partial and say so.",
  "L4.9": "After editing a template title, put it back as it was.",
  "L5.2": "Try these addresses: <code>/agent/applicants</code> and <code>/admin</code> as your applicant; <code>/admin</code> as hpsedc_agency.",
  "L5.4": "Try <code>/apply</code>, <code>/apply/pro</code>, <code>/profile</code>, <code>/start</code> and <code>/apply?mode=assisted</code>.",
  "L5.1": "On a computer: Chrome → F12 → the phone icon (Ctrl+Shift+M) → iPhone 12 Pro. Or just use your phone.",
  "L1.23": "Needs a fresh account: create one with the <b>+uat2</b> email.",
  "L6.2": "Use your applicant's email. The reset email now arrives for real.",
  "L6.4": "The yellow <b>TEST MODE</b> box on the sign-in page is expected during UAT and is not the Demo Mode button. Fail only if you see a “Demo Mode — one-click logins” button.",
}

def rows():
    url = re.search(r"DATABASE_URL=(.*)", open(VERIFY_ENV).read()).group(1).strip()
    sql = f"""select coalesce(json_agg(json_build_array(r.session, r.test_plan, r.item_ref, r.description, r.test_steps, r.expected_result, coalesce(r.plan_note,''))
              order by r.session, r.sort_order), '[]') from requirements r join projects p on p.id=r.project_id
              where p.slug='{PROJECT}' and r.test_plan in ('run','with')"""
    out = subprocess.run(["psql", url, "-tAc", sql], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

e = html.escape

def steps_html(s):
    parts = [p.strip() for p in re.split(r";\s+", s) if p.strip()]
    return "<ol>" + "".join(f"<li>{e(p)}</li>" for p in parts) + "</ol>"

def build():
    data = rows()
    by = {}
    for r in data: by.setdefault(int(r[0]), []).append(r)
    n_run = sum(1 for r in data if r[1] == "run"); n_with = sum(1 for r in data if r[1] == "with")
    today = datetime.date.today().strftime("%-d %b %Y")

    toc, body = [], []
    for n in sorted(by):
        title, role, acct, mins, intro = SESSIONS[n]
        cases = by[n]
        toc.append(f'<tr><td>{n}</td><td><a href="#s{n}">{e(title)}</a></td><td>{e(acct)}</td><td>{sum(1 for c in cases if c[1]=="run")}</td><td>~{mins} min</td></tr>')
        cs = []
        for _, plan, ref, desc, st, exp, note in cases:
            tip = TIPS.get(ref)
            if plan == "with":
                cs.append(f'''<div class="case with"><div class="ch"><span class="ref">{e(ref)}</span><span class="t">{e(desc)}</span><span class="tag">retest · checked with the case above</span></div>
                <p class="note">{e(note)}</p><p class="exp"><b>Expected:</b> {e(exp)}</p><p class="mark">Mark {e(ref)} in Verify too.</p></div>''')
                continue
            cs.append(f'''<div class="case"><div class="ch"><span class="ref">{e(ref)}</span><span class="t">{e(desc)}</span><span class="box">☐ Pass ☐ Fail ☐ Partial</span></div>
            <div class="grid"><div><h4>Do this</h4>{steps_html(st)}{f'<div class="tip"><b>Data and tips:</b> {tip}</div>' if tip else ''}</div>
            <div><h4>Expected</h4><p>{e(exp)}</p></div></div></div>''')
        carry = f'<div class="carry"><b>Carry forward:</b> {e(CARRY[n])}</div>' if n in CARRY else ""
        body.append(f'''<section class="session" id="s{n}"><div class="sh"><span class="sn">Session {n}</span><h2>{e(title)}</h2></div>
        <p class="meta"><b>Sign in as:</b> {e(acct)} &nbsp;·&nbsp; <b>Role:</b> {e(role)} &nbsp;·&nbsp; <b>Time:</b> about {mins} minutes</p>
        <p class="intro">{e(intro)}</p>{"".join(cs)}{carry}</section>''')

    return TEMPLATE.format(today=today, n_run=n_run, n_with=n_with, toc="".join(toc), body="".join(body))

TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lite UAT Test Script</title>
<style>
:root{{--ink:#1c2430;--muted:#5b6575;--rule:#dfe3ea;--soft:#f5f7fa;--accent:#1f4fbf;--warn:#9a5b00;--warnbg:#fff7e6;--ok:#0b6b45;--okbg:#eaf7f0}}
*{{box-sizing:border-box}} body{{margin:0;background:#fff;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Nirmala UI","Noto Sans Devanagari",Mangal,sans-serif}}
main{{max-width:980px;margin:0 auto;padding:32px 16px 64px}}
h1{{font-size:28px;margin:0 0 4px}} h2{{font-size:20px;margin:0}} h3{{font-size:17px;margin:28px 0 8px}} h4{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px}}
.sub{{color:var(--muted);margin:0 0 20px}} a{{color:var(--accent)}}
table{{border-collapse:collapse;width:100%;font-size:14px}} th,td{{border-bottom:1px solid var(--rule);padding:7px 8px;text-align:left;vertical-align:top}} th{{background:var(--soft);font-weight:600}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin:12px 0}}
.card{{border:1px solid var(--rule);border-radius:10px;padding:14px 16px;background:#fff}} .card h3{{margin-top:0}}
.card ul,.card ol{{margin:6px 0 0;padding-left:20px}}
.rules{{background:var(--warnbg);border:1px solid #f1d39a;border-radius:10px;padding:12px 16px}} .rules h3{{margin-top:0;color:var(--warn)}}
code{{background:var(--soft);padding:1px 5px;border-radius:4px;font-size:13px}}
.session{{margin-top:36px;border-top:3px solid var(--ink);padding-top:14px;break-before:page}}
.sh{{display:flex;align-items:baseline;gap:12px}} .sn{{font-weight:700;color:var(--accent);white-space:nowrap}}
.meta{{margin:6px 0 2px;font-size:14px}} .intro{{color:var(--muted);margin:4px 0 12px}}
.case{{border:1px solid var(--rule);border-radius:10px;padding:12px 14px;margin:10px 0;break-inside:avoid}}
.case.with{{background:var(--soft);border-style:dashed}}
.ch{{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}} .ref{{font-weight:700;font-family:ui-monospace,Menlo,monospace}} .t{{font-weight:600;flex:1;min-width:200px}}
.box{{font-size:13px;color:var(--muted);white-space:nowrap}} .tag{{font-size:12px;color:var(--muted)}}
.grid{{display:grid;grid-template-columns:3fr 2fr;gap:16px}} .grid ol{{margin:0;padding-left:20px}} .grid p{{margin:0}}
.tip{{margin-top:8px;background:var(--okbg);border-radius:6px;padding:7px 10px;font-size:14px}}
.note{{color:var(--muted);font-size:14px;margin-top:6px}} .exp{{margin:4px 0}} .mark{{font-size:13px;color:var(--muted);margin:2px 0 0}}
.carry{{margin-top:10px;border-left:4px solid var(--accent);padding:6px 12px;background:#eef3ff;border-radius:4px}}
@media (max-width:700px){{.grid{{grid-template-columns:1fr}} .data tr{{display:grid;grid-template-columns:110px 1fr}} .data td{{border:0;padding:4px 6px}} .data tr{{border-bottom:1px solid var(--rule)}} code{{word-break:break-all}}}}
@media print{{main{{padding:0}} body{{font-size:12px}} a{{color:inherit;text-decoration:none}} .session{{break-before:page}}}}
</style></head><body><main>
<h1>HireStream Lite — UAT test script</h1>
<p class="sub">For Piyush · {n_run} cases to run by hand, plus {n_with} defect retests checked along the way · prepared {today}</p>

<div class="cards">
<div class="card"><h3>The two portals</h3><ul>
<li><b>Verify</b> — where you read the cases and mark results:<br><a href="https://verify-stg.agentryx.dev">verify-stg.agentryx.dev</a> (piyush / your password)</li>
<li><b>HireStream Lite</b> — the portal you test:<br><a href="https://hirestream-lite.agentryx.dev">hirestream-lite.agentryx.dev</a></li></ul>
<p class="note">Keep them side by side. A second, private (incognito) window lets you be two people at once — e.g. HPSEDC in one, the applicant in the other.</p></div>
<div class="card"><h3>Accounts on Lite</h3><table>
<tr><th>Account</th><th>Who</th></tr>
<tr><td><code>demo_admin</code></td><td>HPSEDC Admin</td></tr>
<tr><td><code>hpsedc_agency</code></td><td>HPSEDC Placement Cell</td></tr>
<tr><td><code>demo_candidate</code></td><td>A ready-made applicant</td></tr>
<tr><td>your +uat1 account</td><td>The applicant you create in session 3</td></tr></table>
<p class="note">Password for the three demo accounts: <code>test123</code></p></div>
</div>

<div class="card"><h3>Your test data card (session 3)</h3><table class="data">
<tr><td>Full name</td><td>UAT Piyush One</td><td>Email</td><td>your Gmail with <b>+uat1</b> added, e.g. <code>yourname+uat1@gmail.com</code> — it arrives in your normal inbox</td></tr>
<tr><td>Password</td><td><code>Test@2026</code></td><td>Second account (L1.23)</td><td><code>yourname+uat2@gmail.com</code></td></tr>
<tr><td>Date of birth</td><td>15/08/1995</td><td>Mobile</td><td>+971 501234567 (WhatsApp +91 9876500000)</td></tr>
<tr><td>Aadhaar</td><td>234567890124 (test number)</td><td>Passport</td><td>Z1234567 · issued 01/01/2022 · expires 31/12/2031 · Shimla</td></tr>
<tr><td>Address</td><td>Ward 4, Mall Road, Shimla</td><td>PIN</td><td>171001</td></tr>
<tr><td>Trades</td><td>Welder, Driver, Nurse</td><td>Languages</td><td>Hindi, English, Punjabi</td></tr>
<tr><td>Education</td><td>12th pass (HPBOSE) → then Degree (HPU)</td><td>Experience</td><td>Welder, 4 years</td></tr></table>
<p class="note">All of these are made up. Never type a real Aadhaar or passport number.</p></div>

<div class="cards">
<div class="card"><h3>How to mark a result</h3><ol>
<li>In Verify open <b>Test run</b> and go to the session.</li>
<li>Do the steps on Lite and compare with <b>Expected</b>.</li>
<li>Mark <b>Pass</b> (all as expected), <b>Fail</b> (wrong or broken) or <b>Partial</b> (some parts fine, or you could only test part).</li>
<li>For Fail or Partial, write what you saw and attach a screenshot.</li></ol>
<p class="note">Cases are in story order: each session uses what the one before it created. Do them in order.</p></div>
<div class="card"><h3>Anything else</h3><ul>
<li><b>Report a finding</b> (top bar in Verify) — anything wrong that no case covers.</li>
<li><b>Ask for help</b> — questions about a case or the portal.</li>
<li>The automated checks run separately; their result is shown on each case, but your mark is the one that counts.</li></ul></div>
</div>

<div class="rules"><h3>Rules</h3><ul>
<li>Do <b>not</b> press <b>Run lifecycle</b> in Admin → Lifecycle. It can close every job on the portal.</li>
<li>Before changing a setting, note the old value; put it back when the case is done.</li>
<li>Emails are real now. Only use your own addresses (the +uat trick), never someone else's.</li>
<li>Don't delete or close <b>UAT Welder — Piyush</b> — your applicant applies to it.</li></ul></div>

<h3>Sessions</h3>
<table><tr><th>#</th><th>Session</th><th>Sign in as</th><th>Cases</th><th>Time</th></tr>{toc}</table>
<p class="note">Not in this script: 3 cases the automated checks prove, and 2 that are not ready yet (preferred countries on the form, and the decision on jobs without a deadline). Verify shows them under “Proved by automation” and “Not ready to test yet”.</p>

{body}

<section class="session"><h2>When you finish</h2>
<p>Check the Verify Dashboard: every case should show Pass, Fail or Partial. Anything you couldn't test, mark Partial with the reason. Then tell us — we fix the Fails, and you retest the ones marked for re-verify.</p></section>
</main></body></html>"""

def plain(t):
    t = re.sub(r"<br\s*/?>", "\n", t)
    return html.unescape(re.sub(r"<[^>]+>", "", t)).strip()

def sync():
    """Write each tip into its case's plan_note in Verify (run cases only)."""
    url = re.search(r"DATABASE_URL=(.*)", open(VERIFY_ENV).read()).group(1).strip()
    for ref, tip in TIPS.items():
        q = plain(tip).replace("'", "''")
        subprocess.run(["psql", url, "-qtAc", f"""update requirements r set plan_note = '{q}' from projects p
            where p.id = r.project_id and p.slug = '{PROJECT}' and r.item_ref = '{ref}' and r.test_plan = 'run'"""], check=True)
    print("synced", len(TIPS), "tips into Verify")

if __name__ == "__main__":
    import sys
    if "--sync" in sys.argv: sync()
    out = os.path.join(HERE, "Lite_UAT_Test_Script.html")
    open(out, "w").write(build())
    print("wrote", out)
