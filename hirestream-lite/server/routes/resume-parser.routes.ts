import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { ALL_SKILLS, SKILL_CATEGORIES } from "./resume-parser.skills";

const router = Router();

// POST /api/v1/resume/parse — parse resume text and extract structured data
// Simple heuristic-based parser. Replace with GPT/Claude integration in production.
router.post("/parse", protect, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ success: false, message: "text field required" });
    }

    const normalized = text.toLowerCase();

    // ── SKILL EXTRACTION ───────────────────────────────────────────────
    // Match skills from our canonical list (word-boundary aware)
    const foundSkills = new Set<string>();
    for (const skill of ALL_SKILLS) {
      const pattern = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");
      if (pattern.test(normalized)) foundSkills.add(skill);
    }

    // ── EXPERIENCE EXTRACTION ──────────────────────────────────────────
    // Look for patterns like "5 years", "10+ years of experience"
    const expMatch = normalized.match(/(\d{1,2})\+?\s*(years?|yrs?)\s*(of\s*)?(experience|exp)/i);
    const totalYears = expMatch ? parseInt(expMatch[1]) : null;

    // ── EDUCATION EXTRACTION ───────────────────────────────────────────
    const degrees: string[] = [];
    const degreePatterns = [
      { re: /b\.?\s*tech|bachelor\s*of\s*technology/gi, label: "B.Tech" },
      { re: /m\.?\s*tech|master\s*of\s*technology/gi, label: "M.Tech" },
      { re: /b\.?\s*e\b|bachelor\s*of\s*engineering/gi, label: "B.E." },
      { re: /m\.?\s*e\b|master\s*of\s*engineering/gi, label: "M.E." },
      { re: /mba|master\s*of\s*business/gi, label: "MBA" },
      { re: /b\.?\s*sc|bachelor\s*of\s*science/gi, label: "B.Sc" },
      { re: /m\.?\s*sc|master\s*of\s*science/gi, label: "M.Sc" },
      { re: /b\.?\s*com/gi, label: "B.Com" },
      { re: /m\.?\s*com/gi, label: "M.Com" },
      { re: /b\.?\s*a\b/gi, label: "B.A." },
      { re: /m\.?\s*a\b/gi, label: "M.A." },
      { re: /diploma/gi, label: "Diploma" },
      { re: /ph\.?d/gi, label: "PhD" },
      { re: /intermediate|12th|hsc/gi, label: "12th" },
    ];
    for (const { re, label } of degreePatterns) {
      if (re.test(text)) degrees.push(label);
    }

    // ── CONTACT EXTRACTION ─────────────────────────────────────────────
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phoneMatch = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);

    // ── NAME EXTRACTION (first non-empty line heuristic) ───────────────
    let name: string | null = null;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 3)) {
      // Name line: 2-4 capitalized words, no special chars
      if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,3}$/.test(line)) {
        name = line;
        break;
      }
    }

    // ── COUNTRY PREFERENCES ────────────────────────────────────────────
    // Match both canonical country_info names and the short aliases candidates
    // typically write on a CV ("UAE" not "United Arab Emirates"). The output
    // is normalised to canonical names so the rest of the matching/storage
    // path stays consistent with v0.7.3.2 country validation.
    const COUNTRY_ALIASES: Record<string, string> = {
      "UAE": "United Arab Emirates", "United Arab Emirates": "United Arab Emirates",
      "Saudi Arabia": "Saudi Arabia", "KSA": "Saudi Arabia",
      "Qatar": "Qatar", "Kuwait": "Kuwait", "Bahrain": "Bahrain", "Oman": "Oman",
      "USA": "United States of America", "US": "United States of America",
      "United States": "United States of America", "America": "United States of America",
      "UK": "United Kingdom", "Britain": "United Kingdom", "England": "United Kingdom",
      "United Kingdom": "United Kingdom",
      "Canada": "Canada", "Australia": "Australia", "Germany": "Germany",
      "Singapore": "Singapore", "Japan": "Japan", "New Zealand": "New Zealand",
      "Malaysia": "Malaysia", "Ireland": "Ireland", "Israel": "Israel",
      "Maldives": "Maldives",
    };
    const foundCountries = Array.from(new Set(
      Object.keys(COUNTRY_ALIASES)
        .filter(alias => new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(text))
        .map(alias => COUNTRY_ALIASES[alias])
    ));

    // ── CATEGORIZED SKILLS ─────────────────────────────────────────────
    const skillsByCategory: Record<string, string[]> = {};
    const skillsList = Array.from(foundSkills);
    for (const cat of SKILL_CATEGORIES) {
      const inCat = skillsList.filter(s => cat.skills.includes(s));
      if (inCat.length > 0) skillsByCategory[cat.category] = inCat;
    }

    res.json({
      success: true,
      data: {
        extracted: {
          name,
          email: emailMatch?.[0] || null,
          phone: phoneMatch?.[0] || null,
          experience: totalYears,
          skills: skillsList,
          skillsByCategory,
          degrees: Array.from(new Set(degrees)),
          preferredCountries: foundCountries,
        },
        confidence: {
          skills: skillsList.length > 0 ? "high" : "low",
          experience: totalYears ? "high" : "low",
          degrees: degrees.length > 0 ? "high" : "low",
        },
        stats: {
          totalSkillsFound: skillsList.length,
          textLength: text.length,
          wordCount: text.split(/\s+/).length,
        },
      },
    });
  } catch (err: any) {
    // security 2026-07-07 (A05-1): route through the global handler — raw
    // err.message leaked internal detail to the client.
    next(err);
  }
});

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;
