/**
 * UAT-05 page 4 — review, print & attest.
 *
 * Not just a summary screen: a printable A4 application form. A government
 * application needs a paper artefact the candidate can keep and HPSEDC can
 * file, and the candidate has just typed ~30 answers they will never otherwise
 * see in one place.
 *
 * Print is `@media print` + window.print(), which gives Print AND the browser's
 * native Save-as-PDF for free. A server-generated PDF stored against the
 * application record is the later, heavier option if HPSEDC want it on file —
 * see the field spec's open questions.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Printer, Pencil } from "lucide-react";
import type { PickedProfession, Profession } from "../register";

interface Props {
  onEdit: (step: number) => void;
  profile: any;
  picked: PickedProfession[];
  langs: { language: string; proficiency: string }[];
  profByKey: Record<string, Profession>;
  labelOf: (p?: Profession) => string;
}

/** One label/value pair. `—` for empty so a printed form shows the gap
 *  explicitly rather than a blank that could be a printing fault. */
function Row({ label, value }: { label: string; value?: any }) {
  return (
    <div className="py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 block">{label}</span>
      <span className="text-sm text-slate-900 font-medium">{value || "—"}</span>
    </div>
  );
}

function SectionCard({
  n, title, onEdit, children,
}: { n: number; title: string; onEdit?: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 lg:p-5 break-inside-avoid">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
        <h2 className="text-sm font-bold text-slate-900 tracking-tight">{n}. {title}</h2>
        {onEdit && (
          <button onClick={onEdit} className="print:hidden inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 font-medium">
            <Pencil className="w-3 h-3" /> {t("reg.p4.edit")}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReviewPage({ onEdit, profile: p, picked, langs, profByKey, labelOf }: Props) {
  const { t } = useTranslation();
  const addr = (a1: string, a2: string, d: string, s: string, pin: string) =>
    [a1, a2, d, s, pin].filter(Boolean).join(", ");
  // Stable per-render, and only ever a display/print reference — the real
  // application id is the server's. Deliberately derived from the candidate's
  // own data rather than random so a reprint shows the same string.
  const ref = `HP-${(p.passportNumber || p.aadhaarNumber || p.phone || "").slice(-6).toUpperCase() || "------"}`;

  return (
    <div>
      {/* Print stylesheet. A4 portrait, and the only thing on the paper is the
          form.
          `header, nav, footer` covers the app frame (Header renders <nav>,
          Footer renders <footer>). It does NOT cover the registration shell,
          which is built from divs — that chrome carries `print:hidden` at its
          own source in RegisterShell. Getting that wrong printed the progress
          bar, the screen heading and the buttons, and dropped the trust footer
          ON TOP of the candidate's answers. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          html, body { background: #fff !important; }
          .print\\:hidden { display: none !important; }
          .print-only { display: block !important; }
          header, nav, footer { display: none !important; }
          /* Never split a card mid-answer across a page break. */
          .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          /* Shadows grey out text on cheap printers and waste toner. */
          * { box-shadow: none !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Paper letterhead — screen never shows it, print always does. */}
      <div className="print-only mb-6">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t("shell.govBrand")}</h1>
            <p className="text-xs text-slate-600">{t("shell.govSubtitle")}</p>
            <p className="text-sm font-semibold text-slate-900 mt-2">{t("reg.p4.formTitle")}</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p><strong>{t("reg.p4.ref")}:</strong> {ref}</p>
            <p><strong>{t("reg.p4.date")}:</strong> {new Date().toLocaleDateString("en-IN")}</p>
            {/* Blank box: the paper copy expects a pasted photograph. We collect
                no photo at stage 1 — that would be an upload, and stage 1 is
                deliberately upload-free. */}
            <div className="w-[28mm] h-[35mm] border border-slate-400 mt-2 flex items-center justify-center">
              <span className="text-[8px] text-slate-400">{t("reg.p4.photo")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{t("reg.p4.checkHint")}</p>
        <Button variant="outline" onClick={() => window.print()} className="h-11 gap-2">
          <Printer className="w-4 h-4" /> {t("reg.p4.print")}
        </Button>
      </div>

      {/* Two columns on screen so the whole application is visible at once;
          ONE column in print — a form is read down the page, and a 2-up grid
          paginates into orphaned half-sections. print:!block beats lg:grid,
          which would otherwise still apply at A4's effective width. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-5 print:!block">
        <SectionCard n={1} title={t("reg.p4.s1")} onEdit={() => onEdit(0)}>
          <Row label={t("reg.p1.fullName")} value={p.fullName} />
          <Row label={t("reg.p1.dob")} value={p.dateOfBirth} />
          <Row label={t("reg.p1.gender")} value={p.sex ? t(`reg.p1.${p.sex === "male" ? "male" : p.sex === "female" ? "female" : "other"}`, p.sex) : ""} />
          <Row label={t("reg.p1.father")} value={p.fatherName} />
          <Row label={t("reg.p1.mother")} value={p.motherName} />
          <Row label={t("reg.p1.passportNo")}
            value={p.noPassportYet ? t("reg.p4.noPassportYet") : p.passportNumber} />
          {!p.noPassportYet && <Row label={t("reg.p1.passportExpiry")} value={p.passportExpiry} />}
          {!p.noPassportYet && <Row label={t("reg.p1.passportPlace")} value={p.passportPlaceOfIssue} />}
          {!p.noPassportYet && p.ecrStatus && <Row label={t("reg.p1.ecr")} value={p.ecrStatus.toUpperCase()} />}
          {/* Masked on screen AND on paper: a printed form gets carried around,
              photocopied and left on desks. */}
          <Row label={t("reg.p1.aadhaar")} value={p.aadhaarNumber ? `XXXX XXXX ${p.aadhaarNumber.slice(-4)}` : ""} />
          <Row label={t("reg.p1.disability")}
            value={p.disabilityStatus === "yes" ? `${t("common.yes")} — ${p.disabilityType}` : p.disabilityStatus === "no" ? t("common.no") : ""} />
        </SectionCard>

        <SectionCard n={2} title={t("reg.p4.s2")} onEdit={() => onEdit(0)}>
          <Row label={t("reg.p1.mobile")} value={p.phone} />
          <Row label={t("reg.p1.whatsapp")} value={p.whatsappNumber} />
          <Row label={t("reg.p1.email")} value={p.email} />
          <Row label={t("reg.p1.homeTown")} value={p.homeTown} />
          <Row label={t("reg.p1.permanent")} value={addr(p.pAddr1, p.pAddr2, p.pDistrict, p.pState, p.pPin)} />
          <Row label={t("reg.p1.correspondence")}
            value={p.corrSame ? t("reg.p4.sameAsPermanent") : addr(p.cAddr1, p.cAddr2, p.cDistrict, p.cState, p.cPin)} />
        </SectionCard>

        <SectionCard n={3} title={t("reg.p4.s3")} onEdit={() => onEdit(1)}>
          <div className="py-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500 block mb-1">{t("reg.p4.trades")}</span>
            <div className="flex flex-wrap gap-1.5">
              {picked.map((x) => (
                <span key={x.professionKey} className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-900">
                  {x.professionKey === "other" ? x.otherLabel : labelOf(profByKey[x.professionKey])}
                </span>
              ))}
            </div>
          </div>
          <div className="py-1.5">
            <span className="text-xs text-slate-500 block mb-1">{t("reg.p2.languages")}</span>
            <span className="text-sm text-slate-900 font-medium">
              {langs.map((l) => `${l.language} (${t(`reg.lang.${l.proficiency}`)})`).join(", ") || "—"}
            </span>
          </div>
        </SectionCard>

        <SectionCard n={4} title={t("reg.p4.s4")} onEdit={() => onEdit(2)}>
          <Row label={t("reg.p3.highest")} value={p.eduLevel ? t(`reg.edu.${p.eduLevel}`) : ""} />
          {p.eduBoard && <Row label={t("reg.p3.board")} value={p.eduBoard} />}
          {p.eduInstitution && <Row label={t("reg.p3.institution")} value={p.eduInstitution} />}
          {p.eduYear && <Row label={t("reg.p3.year")} value={String(p.eduYear)} />}

          {picked.map((x) => {
            const prof = profByKey[x.professionKey];
            const a = x.addonData || {};
            return (
              <div key={x.professionKey} className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-900 mb-1">
                  {x.professionKey === "other" ? x.otherLabel : labelOf(prof)}
                </p>
                <Row label={t("reg.p3.months")} value={`${x.experienceMonths} (${(x.experienceMonths / 12).toFixed(1)} ${t("reg.p4.years")})`} />
                {x.specificSkills?.length > 0 && <Row label={t("reg.p3.specificSkills")} value={x.specificSkills.join(", ")} />}
                {a.qualification && <Row label={t("reg.p4.qualification")} value={a.qualification} />}
                {a.institution && <Row label={t("reg.p3.institution")} value={`${a.institution}${a.year ? `, ${a.year}` : ""}`} />}
                {a.councilRegNumber && <Row label={t("reg.blk.councilNo")} value={`${a.councilRegNumber} (${a.councilName || "—"})`} />}
                {a.licenceNumber && <Row label={t("reg.blk.licenceNo")} value={`${a.licenceNumber} — ${a.licenceClass || "—"}${a.badgeHeld ? ` — ${t("reg.p4.withBadge")}` : ""}`} />}
                {x.lastEmployerName && <Row label={t("reg.p3.lastEmployer")} value={`${x.lastEmployerName}${x.lastEmployerCountry ? `, ${x.lastEmployerCountry}` : ""}`} />}
              </div>
            );
          })}
        </SectionCard>
      </div>

      {/* Declaration. On screen it sets the expectation that proof comes later —
          which is the whole deal being struck by the 20k:500 design. On paper it
          is the signature block a government form needs. */}
      <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4 lg:p-5 break-inside-avoid">
        <h2 className="text-sm font-bold text-slate-900 mb-2">{t("reg.p4.declaration")}</h2>
        <p className="text-sm text-slate-700">{t("reg.p4.declarationText")}</p>
        {/* Signature block. Grid, not flex+margins: the flex version let the
            Date rule and the Signature rule overlap on paper, which on a
            government form is the difference between a valid signed
            declaration and a mess someone has to reprint. */}
        <div className="print-only mt-10 grid grid-cols-2 gap-x-10 gap-y-8 text-xs text-slate-700">
          <div className="border-t border-slate-500 pt-1.5">{t("reg.p4.place")}</div>
          <div className="border-t border-slate-500 pt-1.5">{t("reg.p4.date")}</div>
          <div />
          <div className="border-t border-slate-500 pt-1.5">{t("reg.p4.signature")}</div>
        </div>
      </div>

      <div className="print-only mt-4 text-center text-[9px] text-slate-500">
        {t("reg.p4.ref")}: {ref} · {t("shell.govBrand")}
      </div>
    </div>
  );
}
