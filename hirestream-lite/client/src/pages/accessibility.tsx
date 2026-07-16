/**
 * Accessibility / Screen Reader Access page — v0.7.6.0
 *
 * Follows the standard Government of India website pattern (GIGW —
 * Guidelines for Indian Government Websites). Lists supported screen
 * readers, accessibility features built into the portal, the WCAG
 * conformance statement, and who to contact for accessibility issues.
 *
 * Wired from the "Screen Reader" link in <Masthead />.
 */

import { ExternalLink, Keyboard, Eye, Volume2, Mail, ChevronRight } from "lucide-react";

const SCREEN_READERS: { name: string; cost: string; platform: string; url: string }[] = [
  { name: "NVDA",            cost: "Free, open source",     platform: "Windows",       url: "https://www.nvaccess.org/download/" },
  { name: "JAWS",            cost: "Commercial",            platform: "Windows",       url: "https://www.freedomscientific.com/products/software/jaws/" },
  { name: "VoiceOver",       cost: "Built-in, free",        platform: "macOS / iOS",   url: "https://www.apple.com/in/accessibility/vision/" },
  { name: "TalkBack",        cost: "Built-in, free",        platform: "Android",       url: "https://support.google.com/accessibility/android/answer/6283677" },
  { name: "ChromeVox",       cost: "Free",                  platform: "Chrome browser", url: "https://chromewebstore.google.com/detail/screen-reader/kgejglhpjiefppelpmljglcjbhoiplfn" },
  { name: "Narrator",        cost: "Built-in, free",        platform: "Windows 10/11", url: "https://support.microsoft.com/en-us/windows/complete-guide-to-narrator-e4397a0d-ef4f-b386-d8ae-c172f109bdb1" },
  { name: "Orca",            cost: "Free, open source",     platform: "Linux (GNOME)", url: "https://help.gnome.org/users/orca/stable/" },
];

export default function AccessibilityPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Accessibility Statement</h1>
        <p className="text-sm text-slate-500">HireStream — HPSEDC Overseas Placement Portal</p>
      </header>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm text-blue-900">
          HPSEDC is committed to making the HireStream portal accessible to everyone,
          including users with visual, hearing, motor, or cognitive disabilities. The
          portal is built to <strong>WCAG 2.1 Level AA</strong> targets and follows the
          Government of India's <strong>GIGW (Guidelines for Indian Government Websites)</strong>.
          If you find anything that does not work for you, please tell us so we can fix it.
        </p>
      </section>

      {/* ── Screen readers ─────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-900">Supported Screen Readers</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          HireStream has been tested with the following screen-reader software. We
          recommend using the latest version of any of these tools for the best experience.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Software</th>
                <th className="text-left px-4 py-2 font-semibold">Platform</th>
                <th className="text-left px-4 py-2 font-semibold">Cost</th>
                <th className="text-left px-4 py-2 font-semibold">Get it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SCREEN_READERS.map((r) => (
                <tr key={r.name}>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.platform}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.cost}</td>
                  <td className="px-4 py-2.5">
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      Visit <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Built-in features ─────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl font-bold text-slate-900">Accessibility Features Built In</h2>
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Skip to main content</strong> — press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">Tab</kbd> on any page to focus the skip link and jump past the header.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Keyboard navigation</strong> — all interactive elements are reachable with <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">Tab</kbd> / <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">Shift+Tab</kbd> and activated with <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">Space</kbd>.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Text size controls</strong> — the <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">A⁻ A A⁺</kbd> buttons in the header adjust the base font size.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Dark mode</strong> — toggle via the moon icon in the header. Respects your system preference by default.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Bilingual interface</strong> — English and Hindi, switchable via the language selector.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Semantic markup</strong> — ARIA labels, landmark regions (header, nav, main, footer), and form labels for screen-reader navigation.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span><strong>Focus indicators</strong> — every focusable element has a visible blue outline when keyboard-focused.</span>
          </li>
        </ul>
      </section>

      {/* ── Keyboard shortcuts ───────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-5 h-5 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">Keyboard Shortcuts</h2>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Standard browser shortcuts work everywhere. Application-specific shortcuts:
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Shortcut</th>
                <th className="text-left px-4 py-2 font-semibold">Action</th>
                <th className="text-left px-4 py-2 font-semibold">Available on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2.5"><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs">Tab</kbd> from any page</td>
                <td className="px-4 py-2.5 text-slate-700">Show "Skip to main content" link</td>
                <td className="px-4 py-2.5 text-slate-500">Everywhere</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5"><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs">A</kbd></td>
                <td className="px-4 py-2.5 text-slate-700">Accept selected applicants (status: <em>selected</em>)</td>
                <td className="px-4 py-2.5 text-slate-500">Applicant review modal</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5"><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs">P</kbd></td>
                <td className="px-4 py-2.5 text-slate-700">Partial accept (status: <em>shortlisted</em>)</td>
                <td className="px-4 py-2.5 text-slate-500">Applicant review modal</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5"><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs">R</kbd></td>
                <td className="px-4 py-2.5 text-slate-700">Reject selected applicants (status: <em>rejected</em>)</td>
                <td className="px-4 py-2.5 text-slate-500">Applicant review modal</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5"><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-xs">W</kbd></td>
                <td className="px-4 py-2.5 text-slate-700">Waive — mark looked-at, no decision (status: <em>reviewed</em>)</td>
                <td className="px-4 py-2.5 text-slate-500">Applicant review modal</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Conformance ──────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-3">Conformance Statement</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-sm text-slate-700">
          <p><strong>Standard:</strong> WCAG 2.1 Level AA (working towards full conformance)</p>
          <p><strong>National guideline:</strong> GIGW (Guidelines for Indian Government Websites)</p>
          <p><strong>Last review:</strong> 2026 — accessibility is reviewed each release.</p>
          <p>
            We continuously improve the portal. Known gaps and improvements
            are tracked in our public feedback system. If you encounter a
            barrier, please report it (see contact below).
          </p>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900">Report an Accessibility Issue</h2>
        </div>
        <p className="text-sm text-slate-700 mb-3">
          If any part of HireStream is not accessible to you, please let us know so we can fix it:
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>• Use the <strong>Grievances</strong> page (under "File Grievance" in the footer)</li>
          <li>• Email: <a href="mailto:accessibility@hpsedc.gov.in" className="text-blue-600 hover:underline">accessibility@hpsedc.gov.in</a></li>
          <li>• Mention the page URL, what you tried, what happened, and the assistive technology you were using</li>
        </ul>
      </section>
    </div>
  );
}
