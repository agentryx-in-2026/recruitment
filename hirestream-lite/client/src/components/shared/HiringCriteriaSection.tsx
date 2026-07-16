/**
 * v0.4.33 (Phase 3): "Hiring criteria" section shared between agent
 * job-poster and employer requisition forms. Renders:
 *   - Qualification dropdown (Phase 3 spec §6, Item 5)
 *   - For IELTS countries (UK / AUS / NZ / CAN / IE / USA): a single
 *     numeric input for required IELTS overall band (4.0–9.0)
 *   - For other countries: a multi-row picker (language + CEFR level)
 *
 * The component is country-aware via the `country` prop so the form
 * automatically swaps inputs when the country dropdown above changes.
 * All fields are optional — leaving them blank means the matching engine
 * treats the factor as neutral for everyone (per the configurable
 * missing-criteria policy).
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IELTS_COUNTRIES, QUALIFICATION_LEVELS, CEFR_LEVELS, LANGUAGE_OPTIONS,
} from "@/lib/reference-data";
import { GraduationCap, Languages, Plus, X } from "lucide-react";

interface Props {
  country: string;
  qualification: string;
  setQualification: (v: string) => void;
  requiredIeltsBand: number | null;
  setRequiredIeltsBand: (v: number | null) => void;
  languagesRequired: Record<string, string>;
  setLanguagesRequired: (v: Record<string, string>) => void;
}

export function HiringCriteriaSection({
  country, qualification, setQualification,
  requiredIeltsBand, setRequiredIeltsBand,
  languagesRequired, setLanguagesRequired,
}: Props) {
  const isIelts = useMemo(() => IELTS_COUNTRIES.has(country), [country]);

  function addLanguage() {
    const used = Object.keys(languagesRequired);
    const next = LANGUAGE_OPTIONS.find((l) => !used.includes(l.value));
    if (!next) return;
    setLanguagesRequired({ ...languagesRequired, [next.value]: "B1" });
  }

  function removeLanguage(lang: string) {
    const { [lang]: _, ...rest } = languagesRequired;
    setLanguagesRequired(rest);
  }

  function updateLanguage(oldLang: string, newLang: string, level: string) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(languagesRequired)) {
      if (k === oldLang) next[newLang] = level;
      else next[k] = v;
    }
    setLanguagesRequired(next);
  }

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg text-indigo-600 bg-indigo-50 flex items-center justify-center">
          <GraduationCap className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Hiring criteria <span className="text-[10px] font-medium text-slate-400">(optional)</span></h3>
          <p className="text-[11px] text-slate-500">Qualification + language proficiency the matching engine should score against.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-slate-700 mb-1 block">Minimum qualification</Label>
          <Select value={qualification || ""} onValueChange={(v) => setQualification(v === "_none" ? "" : v)}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Not specified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Not specified — all levels eligible</SelectItem>
              {QUALIFICATION_LEVELS.map((q) => (
                <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-slate-400 mt-1">
            Specifying narrows your candidate pool. Leaving empty means all levels match.
          </p>
        </div>

        {isIelts ? (
          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" /> Required IELTS overall band
              <Badge variant="outline" className="text-[9px] ml-1">{country}</Badge>
            </Label>
            <Input
              type="number" step="0.5" min={4} max={9}
              value={requiredIeltsBand ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setRequiredIeltsBand(v === "" ? null : Number(v));
              }}
              placeholder="e.g. 6.0"
              className="h-10"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              {country} uses IELTS overall. Range 4.0–9.0; common cut-offs: 5.5 for general work, 6.5 for nursing/skilled.
            </p>
          </div>
        ) : (
          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" /> Languages required (CEFR)
            </Label>
            <div className="space-y-1.5">
              {Object.entries(languagesRequired).map(([lang, level]) => (
                <div key={lang} className="flex items-center gap-1.5">
                  <Select value={lang} onValueChange={(v) => updateLanguage(lang, v, level)}>
                    <SelectTrigger className="h-9 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={level} onValueChange={(v) => setLanguagesRequired({ ...languagesRequired, [lang]: v })}>
                    <SelectTrigger className="h-9 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLanguage(lang)}
                    className="h-9 w-9 p-0 text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLanguage}
                disabled={Object.keys(languagesRequired).length >= LANGUAGE_OPTIONS.length}
                className="h-8 text-xs w-full">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add language
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              CEFR levels A1 (beginner) → C2 (proficient). Default level B1 covers intermediate. Each entry candidate must meet to score full marks.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
