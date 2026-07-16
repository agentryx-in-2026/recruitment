import { Router } from "express";
import { getSetting } from "../services/settings.service";

const router = Router();

// HP-3: public (unauthenticated) capability flags. Lets the signup UI show
// only the roles this deployment opens for self-registration. Exposes ONLY
// non-sensitive capability booleans — never secrets or internal settings.
router.get("/public", async (_req, res) => {
  try {
    const [employerSelfReg, agencySelfReg, agencyMode, assistedCallback, standardReg, professionalReg, helplinePhone, helplineHours] = await Promise.all([
      getSetting<boolean>("capability.employer_self_registration"),
      getSetting<boolean>("capability.agency_self_registration"),
      getSetting<string>("capability.agency_mode"),
      getSetting<boolean>("capability.assisted_callback_enabled"),
      getSetting<boolean>("capability.standard_registration_enabled"),
      getSetting<boolean>("capability.professional_registration_enabled"),
      getSetting<string>("contact.helpline_phone"),
      getSetting<string>("contact.helpline_hours"),
    ]);
    res.json({
      success: true,
      data: {
        capabilities: {
          employerSelfRegistration: !!employerSelfReg,
          agencySelfRegistration: !!agencySelfReg,
          agencyMode: agencyMode || "single",
          // default true when unset so an un-seeded deploy still offers them
          assistedCallbackEnabled: assistedCallback !== false,
          standardRegistrationEnabled: standardReg !== false,
          professionalRegistrationEnabled: professionalReg !== false,
        },
        // Public contact info — the candidate UI shows the helpline only when
        // a real number is set, so no placeholder number is ever displayed.
        contact: {
          helplinePhone: (helplinePhone || "").trim(),
          helplineHours: (helplineHours || "").trim(),
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: { code: 500, message: "config unavailable" } });
  }
});

export default router;
