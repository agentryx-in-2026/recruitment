/**
 * UAT-05 Item 21 — the five add-on blocks, keyed by professionKey.
 *
 * ── The split, and why it is here ───────────────────────────────────────────
 * Item 21 has two halves. HPSEDC own the DATA (which qualifications count,
 * which documents are required, the skills list, the note) — that lives in the
 * `profession_requirements` table and they edit it without a release. We own
 * the SHAPE (a nurse has a Council registration NUMBER and an issuing council;
 * a driver has a licence CLASS) — that is this file.
 *
 * Making the shapes admin-authorable too would mean a form builder, which is
 * the rule engine we are explicitly not building. Five hardcoded shapes plus a
 * fully editable table is the 80/20: HPSEDC can add profession #20 and set its
 * quals/docs/skills themselves, and only a genuinely new FIELD needs us.
 *
 * ── Everything here is a dropdown, never free text ──────────────────────────
 * Let a candidate type "B.Sc Nursing (Hons.)" and we have invented a fuzzy
 * matching problem that only a model could solve. Give them a list and it
 * cannot arise. The list itself comes from the DB (`qualifications`), so the
 * options are HPSEDC's, not ours.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldGrid, Wide } from "./RegisterShell";

/** Free-form per-profession answers. Shape is keyed by professionKey; the
 *  server stores it as jsonb on candidate_professions.addonData. */
export type AddonData = Record<string, any>;

export interface BlockProps {
  /** HPSEDC's qualification list for this profession, from the DB. */
  qualifications: string[];
  value: AddonData;
  onChange: (patch: AddonData) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function QualificationSelect({ qualifications, value, onChange, label }: BlockProps & { label: string }) {
  return (
    <div>
      <Label className="text-sm font-medium text-slate-700">{label} *</Label>
      <Select value={value.qualification || ""} onValueChange={(v) => onChange({ qualification: v })}>
        <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {qualifications.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function InstitutionYear({ value, onChange, instLabel }: BlockProps & { instLabel: string }) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <Label className="text-sm font-medium text-slate-700">{instLabel} *</Label>
        <Input className="h-11 mt-1.5" maxLength={120} value={value.institution || ""}
          onChange={(e) => onChange({ institution: e.target.value })} />
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.year")} *</Label>
        <Input className="h-11 mt-1.5" type="number" min={1950} max={new Date().getFullYear()}
          value={value.year ?? ""} onChange={(e) => onChange({ year: e.target.value ? Number(e.target.value) : null })} />
      </div>
    </>
  );
}

// ── Nurse ─────────────────────────────────────────────────────────────
// A licensed profession: the Council registration is the thing that makes a
// nurse employable abroad, so it is required here and its certificate is a
// required document at the shortlist stage.
function NurseBlock(p: BlockProps) {
  const { t } = useTranslation();
  return (
    <FieldGrid>
      <QualificationSelect {...p} label={t("reg.blk.nurseQual")} />
      <InstitutionYear {...p} instLabel={t("reg.blk.college")} />
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.councilNo")} *</Label>
        <Input className="h-11 mt-1.5" maxLength={60} value={p.value.councilRegNumber || ""}
          onChange={(e) => p.onChange({ councilRegNumber: e.target.value })} />
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.councilName")} *</Label>
        <Select value={p.value.councilName || ""} onValueChange={(v) => p.onChange({ councilName: v })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="HP Nursing Registration Council">HP Nursing Registration Council</SelectItem>
            <SelectItem value="Indian Nursing Council">Indian Nursing Council</SelectItem>
            <SelectItem value="Other State Nursing Council">{t("reg.blk.otherStateCouncil")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.regValidUntil")}</Label>
        <Input className="h-11 mt-1.5" type="date" value={p.value.councilValidUntil || ""}
          onChange={(e) => p.onChange({ councilValidUntil: e.target.value })} />
      </div>
    </FieldGrid>
  );
}

// ── Caregiver ─────────────────────────────────────────────────────────
// Deliberately NOT merged with Nurse despite HPSEDC's "Caregiver/Nurse" bullet:
// no licence, no Council, a 3-6 month certificate, and "None yet" is a valid
// answer. Requiring Council registration here would destroy the largest
// low-barrier Gulf funnel there is.
function CaregiverBlock(p: BlockProps) {
  const { t } = useTranslation();
  const hasCert = p.value.qualification && p.value.qualification !== "No certificate yet";
  return (
    <FieldGrid>
      <QualificationSelect {...p} label={t("reg.blk.caregiverCert")} />
      {hasCert && <InstitutionYear {...p} instLabel={t("reg.blk.trainingInst")} />}
      {hasCert && (
        <div>
          <Label className="text-sm font-medium text-slate-700">{t("reg.blk.courseMonths")}</Label>
          <Input className="h-11 mt-1.5" type="number" min={0} max={60} value={p.value.courseMonths ?? ""}
            onChange={(e) => p.onChange({ courseMonths: e.target.value ? Number(e.target.value) : null })} />
        </div>
      )}
    </FieldGrid>
  );
}

// ── Driver ────────────────────────────────────────────────────────────
// No qualification dropdown: driving needs a LICENCE, not a course, and the
// seeded `qualifications` array is empty for exactly that reason.
//
// Licence class is a FIELD, not a separate profession. HPSEDC's "appropriate
// vehicle class" wording tempts you into per-class rows or conditional rules,
// but the required DOCUMENT is the same (a licence) whatever the class — so the
// class is data we store and match jobs against. One row, one dropdown.
const LICENCE_CLASSES = ["LMV", "LMV-TR", "HMV", "HGMV", "HPMV", "Trailer", "Bus"];

function DriverBlock(p: BlockProps) {
  const { t } = useTranslation();
  return (
    <FieldGrid>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.licenceNo")} *</Label>
        <Input className="h-11 mt-1.5" maxLength={40} value={p.value.licenceNumber || ""}
          onChange={(e) => p.onChange({ licenceNumber: e.target.value.toUpperCase() })} />
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.licenceClass")} *</Label>
        <Select value={p.value.licenceClass || ""} onValueChange={(v) => p.onChange({ licenceClass: v })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>{LICENCE_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.licenceValid")} *</Label>
        <Input className="h-11 mt-1.5" type="date" min={today()} value={p.value.licenceValidUntil || ""}
          onChange={(e) => p.onChange({ licenceValidUntil: e.target.value })} />
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.badge")} *</Label>
        <Select value={p.value.badgeHeld === undefined || p.value.badgeHeld === null ? "" : String(p.value.badgeHeld)}
          onValueChange={(v) => p.onChange({ badgeHeld: v === "true" })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t("common.yes")}</SelectItem>
            <SelectItem value="false">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.drovenAbroad")}</Label>
        <Select value={p.value.drivenAbroad === undefined || p.value.drivenAbroad === null ? "" : String(p.value.drivenAbroad)}
          onValueChange={(v) => p.onChange({ drivenAbroad: v === "true" })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t("common.yes")}</SelectItem>
            <SelectItem value="false">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {p.value.drivenAbroad && (
        <div>
          <Label className="text-sm font-medium text-slate-700">{t("reg.blk.whichCountry")}</Label>
          <Input className="h-11 mt-1.5" maxLength={60} value={p.value.abroadCountry || ""}
            onChange={(e) => p.onChange({ abroadCountry: e.target.value })} />
        </div>
      )}
    </FieldGrid>
  );
}

// ── Electrician ───────────────────────────────────────────────────────
function ElectricianBlock(p: BlockProps) {
  const { t } = useTranslation();
  return (
    <FieldGrid>
      <QualificationSelect {...p} label={t("reg.blk.tradeQual")} />
      <InstitutionYear {...p} instLabel={t("reg.blk.itiName")} />
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.certBody")}</Label>
        <Select value={p.value.certBody || ""} onValueChange={(v) => p.onChange({ certBody: v })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NCVT">NCVT</SelectItem>
            <SelectItem value="SCVT">SCVT</SelectItem>
            <SelectItem value="Other">{t("common.other")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FieldGrid>
  );
}

// ── Welder ────────────────────────────────────────────────────────────
// Trade test is a Yes/No here and an OPTIONAL document at shortlist — Saudi
// commonly requires one, most Gulf vacancies do not, and which applies depends
// on the vacancy, which does not exist yet at registration time.
function WelderBlock(p: BlockProps) {
  const { t } = useTranslation();
  return (
    <FieldGrid>
      <QualificationSelect {...p} label={t("reg.blk.tradeQual")} />
      <InstitutionYear {...p} instLabel={t("reg.blk.itiName")} />
      <div>
        <Label className="text-sm font-medium text-slate-700">{t("reg.blk.tradeTest")}</Label>
        <Select value={p.value.tradeTestPassed === undefined || p.value.tradeTestPassed === null ? "" : String(p.value.tradeTestPassed)}
          onValueChange={(v) => p.onChange({ tradeTestPassed: v === "true" })}>
          <SelectTrigger className="h-11 mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t("common.yes")}</SelectItem>
            <SelectItem value="false">{t("common.no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FieldGrid>
  );
}

const BLOCKS: Record<string, React.ComponentType<BlockProps>> = {
  nurse: NurseBlock,
  caregiver: CaregiverBlock,
  driver: DriverBlock,
  electrician: ElectricianBlock,
  welder: WelderBlock,
};

export function ProfessionAddonBlock({ professionKey, ...props }: BlockProps & { professionKey: string }) {
  const Block = BLOCKS[professionKey];
  // A profession with no block configured renders nothing extra — which is the
  // correct outcome for the 14 generic trades, not a missing case. A mason has
  // no mandatory certificate to check, and inventing one would be us
  // legislating rather than HPSEDC.
  if (!Block) return null;
  return <Block {...props} />;
}

/**
 * Per-block completeness. Mirrors the `*` fields above.
 *
 * Client-side only, and only gates the Next button — the server is the
 * authority on what is stored. Deliberately permissive for professions with no
 * block: nothing to require.
 */
export function isAddonComplete(professionKey: string, v: AddonData): boolean {
  switch (professionKey) {
    case "nurse":
      return Boolean(v.qualification && v.institution && v.year && v.councilRegNumber && v.councilName);
    case "caregiver":
      // "No certificate yet" is a complete answer — see the block comment.
      if (!v.qualification) return false;
      if (v.qualification === "No certificate yet") return true;
      return Boolean(v.institution && v.year);
    case "driver":
      return Boolean(v.licenceNumber && v.licenceClass && v.licenceValidUntil && v.badgeHeld !== undefined && v.badgeHeld !== null);
    case "electrician":
    case "welder":
      return Boolean(v.qualification && v.institution && v.year);
    default:
      return true;
  }
}
