# C3: Support, Help & FAQ — {Project Name}
> **Template Version:** 2.0 | **Created By:** AI Agent Pipeline
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Purpose:** Bridge the gap between what users know and what the solution offers. 70% of support requests are the same 20 questions — answer them here and eliminate 70% of support tickets.
> **Production Method:** AI-generated — FAQ, help content, troubleshooting guides, and in-app help are all produced by AI agents from the codebase and PRD.

---

## 0. AI-Driven Generation Methodology

### How Each Artifact Is Generated

| Artifact | AI Source Input | Generation Method | Output |
|----------|----------------|-------------------|--------|
| **FAQ Content** | A5 PRD (features + validation rules) + A3 (modules) + error messages in codebase | AI reads PRD features → generates Q&A pairs in plain language. Reads validation schemas → generates "why isn't X working?" entries. | `faq_content.json` → rendered as FAQ page component |
| **In-App Help Text** | Route files + UI component props + form schemas | AI analyzes each page's components → generates contextual help text, tooltips, empty state messages. | React components in `client/src/components/help/` |
| **Troubleshooting Guide** | Error handler middleware + validation error messages + known issues log | AI reads all error responses in the codebase → generates symptom/cause/solution entries for each error type. | Troubleshooting section in FAQ + PDF export |
| **Feature Discovery** | A3 module list + B6 Quick Wins implemented | AI identifies non-obvious features → generates "hidden gems" list with navigation paths. | Feature discovery section |
| **Support Request Form** | Database schema (users table, roles) + common fields | AI generates a pre-filled form component within the app. | In-app support form |
| **FAQ PDF Export** | All FAQ content | Puppeteer HTML→PDF (same pipeline as C2 manuals) | `C3_FAQ_Guide.pdf` |

### Generation Pipeline

```
Step 1: AI READS CODEBASE
  │  Agent reads: route files, Zod schemas, error handlers, UI components
  │  Agent identifies: all features, validation rules, error messages, form fields
  │
Step 2: AI GENERATES FAQ CONTENT
  │  For each feature: "How do I...?" + "What if...?" + "Why can't I...?"
  │  For each validation rule: "Why does it say [error message]?"
  │  For each role: role-specific Q&A
  │  Output: faq_content.json
  │
Step 3: AI GENERATES IN-APP HELP
  │  For each page/route: context-sensitive help panel content
  │  For each form field: inline help text + tooltip
  │  For empty states: "Get started by..." guidance
  │  Output: React components → client/src/components/help/
  │
Step 4: AI GENERATES TROUBLESHOOTING
  │  Reads all catch blocks, error responses, status codes
  │  Maps: HTTP 400/401/403/404/409/429/500 → user-friendly symptoms + solutions
  │  Output: troubleshooting entries in FAQ
  │
Step 5: AI RENDERS PDF (optional)
  │  FAQ content → branded HTML template → Puppeteer → PDF
  │  Same pipeline as C2 manual generation
  │  Output: C3_FAQ_Guide.pdf
```

### Re-Generation
| Trigger | What's Regenerated |
|---------|-------------------|
| New feature added | New FAQ entries + new help content for that feature's page |
| Error message changed | Troubleshooting entry updated |
| UI redesign | Help text and navigation paths updated |
| Post-launch (Week 1+) | AI analyzes support tickets → generates new FAQ entries for real-world questions |

---

## 1. Support Strategy

### The 70/30 Rule
> Most features exist in the solution but users don't know:
> - **WHERE** to find them (navigation)
> - **HOW** to use them (steps)
> - **WHY** they need them (context)
>
> This document addresses all three. If we get this right, 70% of "bugs" become "oh, I didn't know that was there."

### Support Channels
| Channel | For | Response Time | Available |
|---------|-----|:------------:|-----------|
| **In-App Help (?)** | Quick answers, tooltips, guided tours | Instant | 24/7 |
| **FAQ Page** | Common questions, self-service | Instant | 24/7 |
| **Video Library** | Visual walkthroughs | Instant | 24/7 |
| **Email Support** | {support@domain} | {< X hours} | {Business hours} |
| **Phone Support** | {Critical issues only} | {Immediate} | {Business hours} |
| **Grievance System** | {Formal complaints — built into the app} | {< X hours} | {24/7} |

---

## 2. In-App Help System

### 2.1 Help Implementation
| Feature | Description | Where |
|---------|------------|-------|
| **? Icon (Header)** | Opens help panel/sidebar with context-sensitive help | Every page, top-right |
| **Tooltips** | Hover help on form fields, buttons, icons | All interactive elements |
| **Empty State Guidance** | When a page has no data, show "Here's how to get started..." | All list/table pages |
| **First-Time Guided Tour** | On first login, walk user through key features step-by-step | Dashboard (one-time) |
| **Inline Help Text** | Below form fields: "e.g., Enter your 12-digit Aadhaar number" | All forms |
| **Error Messages** | Human-readable: "File too large. Maximum size is 5MB. Try compressing your PDF." | All error states |

### 2.2 Context-Sensitive Help Map
| Page / Feature | Help Content | Linked Video |
|---------------|-------------|-------------|
| Dashboard | "Your dashboard shows... Here's what each section means" | V03 |
| Job Search | "How to filter jobs, save searches, apply" | V05, V06 |
| Application Status | "What each status means: Submitted → Under Review → Shortlisted → Selected" | V07 |
| Profile Edit | "Keep your profile complete — employers see this first" | V04 |
| Admin Panel | "Configure the system, manage users, view logs" | V13, V16, V17 |
| {Add for every page} | | |

---

## 3. FAQ — Frequently Asked Questions

> *Organize by category. Write answers in the simplest possible language.*

### 3.1 Account & Login
| # | Question | Answer |
|---|---------|--------|
| 1 | How do I create an account? | {Go to {URL}, click "Register", fill in your email, phone number, and password. You'll receive a verification email/SMS — click the link to activate.} |
| 2 | I forgot my password. How do I reset it? | {Click "Forgot Password" on the login page. Enter your registered email. Check your inbox for a reset link (check spam folder too). Link expires in 30 minutes.} |
| 3 | My account is locked. What do I do? | {After 5 failed login attempts, accounts are temporarily locked for 15 minutes. Wait and try again. If still locked, contact support at {email}.} |
| 4 | Can I change my email address? | {Yes. Go to Profile → Settings → Change Email. You'll need to verify the new email.} |
| 5 | Can I use the platform on my phone? | {Yes. The platform works on all modern smartphones. Open {URL} in Chrome, Safari, or any browser. You can also "Add to Home Screen" for app-like experience.} |

### 3.2 {Feature Category 1 — e.g., Job Search & Applications}
| # | Question | Answer |
|---|---------|--------|
| 6 | How do I search for jobs? | {Click "Jobs" in the navigation. Use filters (country, skill, salary range) to narrow results. Click any job to see details.} |
| 7 | How do I apply for a job? | {Open the job listing → Click "Apply Now" → Confirm your profile is complete → Submit. You'll receive a confirmation notification.} |
| 8 | Can I apply for multiple jobs? | {Yes. You can apply for up to {X} jobs at the same time. Track all applications from your Dashboard.} |
| 9 | What do the application statuses mean? | {**Submitted** = Received. **Under Review** = Agency is reviewing. **Shortlisted** = You're selected for interview. **Selected** = Congratulations! **Rejected** = Not selected this time.} |
| 10 | Can I withdraw an application? | {Yes. Dashboard → My Applications → Click the application → "Withdraw". Note: This cannot be undone.} |

### 3.3 {Feature Category 2 — e.g., Documents & Profile}
| # | Question | Answer |
|---|---------|--------|
| 11 | What documents do I need to upload? | {Required: Photo ID (Aadhaar/Passport), Resume (PDF). Optional: Education certificates, work experience letters.} |
| 12 | What file formats are accepted? | {PDF, JPG, PNG. Maximum file size: 5MB per file.} |
| 13 | My file upload is failing. What should I do? | {Check: (1) File is under 5MB, (2) Format is PDF/JPG/PNG, (3) Internet connection is stable. Try compressing the file or using a different browser.} |

### 3.4 {Admin/Agency — Role-Specific}
| # | Question | Answer |
|---|---------|--------|
| 14 | {Role-specific question} | {Answer} |

### 3.5 Technical / General
| # | Question | Answer |
|---|---------|--------|
| 15 | The page is loading slowly. What can I do? | {Try: (1) Refresh the page, (2) Clear browser cache (Ctrl+Shift+Delete), (3) Try a different browser, (4) Check internet connection. If problem persists, contact support.} |
| 16 | I see an error message. What should I do? | {Note down the error message and take a screenshot. Contact support at {email} with the screenshot and description of what you were doing.} |
| 17 | Is my data secure? | {Yes. All data is encrypted in transit (HTTPS) and at rest. Access is role-based — you can only see your own data. See our Privacy Policy for details.} |

---

## 4. Known Limitations & Workarounds

> *Be transparent. If a feature isn't available yet, tell users what to do instead.*

| # | Limitation | Current Workaround | Planned Fix |
|---|-----------|-------------------|-------------|
| 1 | {e.g. DigiLocker integration not yet available} | {Upload documents manually via the Upload page} | {Phase 2 — Q2 2026} |
| 2 | {e.g. SMS notifications pending gateway approval} | {All notifications are sent via email} | {Once credentials received} |
| 3 | {e.g. Report export limited to PDF only} | {For CSV, use the Admin Panel → Export function} | {Phase 3} |
| 4 | {e.g. Mobile keyboard doesn't auto-dismiss on some pages} | {Tap outside the text field to dismiss} | {Next patch} |

---

## 5. Troubleshooting Guide

> *For each issue: What the user sees → Why it happens → How to fix it.*

### Issue 1: {Problem Title — e.g., "Cannot Login"}
```
SYMPTOMS:
- Login button returns to login page without error
- OR: Message "Invalid credentials"

CAUSES:
1. Wrong password (most common)
2. Account not verified (check email)
3. Account deactivated by admin
4. Caps Lock is on

SOLUTIONS:
1. Click "Forgot Password" → reset via email
2. Check inbox (and spam) for verification email
3. Contact admin at {email} to reactivate
4. Check Caps Lock key
```

### Issue 2: {Next Problem}
```
SYMPTOMS:
- {What the user sees}

CAUSES:
- {Why it happens}

SOLUTIONS:
- {Step-by-step fix}
```

> *Add the top 10-15 most common issues here. These are discovered during UAT and first week of launch.*

---

## 6. Feature Discovery Guide

> *"I didn't know the system could do that!" — This section surfaces features users might miss.*

| # | Hidden Gem | Where to Find It | What It Does |
|---|-----------|-----------------|-------------|
| 1 | {e.g. Saved Searches} | {Jobs → ⭐ Star icon on search bar} | {Save search criteria, get notified for new matching jobs} |
| 2 | {e.g. Dashboard Customization} | {Dashboard → ⚙️ gear icon} | {Rearrange dashboard widgets to your preference} |
| 3 | {e.g. Keyboard Shortcuts} | {Press ? anywhere} | {See all keyboard shortcuts for quick navigation} |
| 4 | {e.g. Export to PDF} | {Any report → Download icon} | {Download any report as formatted PDF} |
| 5 | {e.g. Dark Mode} | {Profile → Settings → Theme} | {Switch to dark theme for comfortable viewing} |

---

## 7. Support Request Template

> *When users contact support, ask them to include this information:*

```
SUPPORT REQUEST TEMPLATE
========================
Name: _______________
Role: (Candidate / Agency / Admin)
Email: _______________
Phone: _______________

What were you trying to do?
_______________________________________________

What happened instead?
_______________________________________________

Error message (if any):
_______________________________________________

Screenshot attached? (Yes / No)

Browser: (Chrome / Firefox / Safari / Other)
Device: (Desktop / Mobile / Tablet)
```

---

## 8. FAQ Maintenance Plan

| Activity | Frequency | Who |
|----------|-----------|-----|
| Review support tickets for new FAQ entries | Weekly (first month), Monthly (after) | Support Lead |
| Update FAQ with new common questions | As identified | Support Lead |
| Remove outdated entries (fixed issues) | Monthly | Support Lead |
| Review and update Known Limitations | Per release | Dev Team |
| Analytics: track most-viewed FAQ entries | Monthly | PM |

---

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial FAQ and support plan |

---

> *The FAQ is a LIVING document. It starts small and grows with real user questions. After the first month of launch, 80% of the FAQ content comes from actual support tickets. Plan for it, don't just write it once and forget.*
