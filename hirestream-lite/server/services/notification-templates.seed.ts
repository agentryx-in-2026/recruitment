/**
 * Seed the PWS §5 default notification templates on server boot.
 * Idempotent: only inserts rows that don't exist yet, admin edits are preserved.
 */

import { storage } from "../storage";
import { notificationTemplates } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../config/logger.config";

interface TemplateSeed {
  eventKey: string;
  recipientRole: "candidate" | "agent" | "employer";
  title: string;
  body: string;
  // audit 2026-07-06 (Batch 4B-2): Hindi variants for citizen-facing templates.
  // Delivered when the recipient's preferred_language = 'hi' (bilingual mandate).
  // Staff-facing (agent/employer/admin) templates stay English-only for now.
  titleHi?: string;
  bodyHi?: string;
  channels: string[];
  hideEmployerName: boolean;
}

const DEFAULTS: TemplateSeed[] = [
  // application.submitted — candidate + agent
  { eventKey: "application.submitted", recipientRole: "candidate",
    title: "Application submitted",
    body: "Your application for {{job.title}} is in. Your agency will be in touch soon.",
    titleHi: "आवेदन जमा हो गया",
    bodyHi: "{{job.title}} के लिए आपका आवेदन जमा हो गया है। आपकी एजेंसी जल्द ही संपर्क करेगी।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "application.submitted", recipientRole: "agent",
    title: "New applicant for {{job.title}}",
    body: "{{candidate.fullName}} applied for {{job.title}}.",
    channels: ["in_app"], hideEmployerName: false },

  // application.reviewed — candidate
  { eventKey: "application.reviewed", recipientRole: "candidate",
    title: "Application reviewed",
    body: "Your application for {{job.title}} has been reviewed.",
    titleHi: "आवेदन की समीक्षा हुई",
    bodyHi: "{{job.title}} के लिए आपके आवेदन की समीक्षा कर ली गई है।",
    channels: ["in_app"], hideEmployerName: true },

  // application.shortlisted — candidate + employer
  { eventKey: "application.shortlisted", recipientRole: "candidate",
    title: "You're being considered",
    body: "The agency is putting you forward for {{job.title}}. Sit tight.",
    titleHi: "आप पर विचार किया जा रहा है",
    bodyHi: "एजेंसी आपको {{job.title}} के लिए आगे बढ़ा रही है। कृपया प्रतीक्षा करें।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "application.shortlisted", recipientRole: "employer",
    title: "New candidate for review",
    body: "{{candidate.fullName}} shortlisted by {{agent.agencyName}} for {{job.title}}.",
    channels: ["in_app", "email"], hideEmployerName: false },

  // employer_approved → interview prep
  { eventKey: "application.employer_approved", recipientRole: "candidate",
    title: "The agency is arranging your interview",
    body: "Congrats — your interview for {{job.title}} is being scheduled. Watch for details.",
    titleHi: "एजेंसी आपका इंटरव्यू तय कर रही है",
    bodyHi: "बधाई हो — {{job.title}} के लिए आपका इंटरव्यू तय किया जा रहा है। विवरण की प्रतीक्षा करें।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "application.employer_approved", recipientRole: "agent",
    title: "Schedule interview with {{candidate.fullName}}",
    body: "Employer approved {{candidate.fullName}} for {{job.title}}. Please schedule interview.",
    channels: ["in_app"], hideEmployerName: false },

  // application.rejected — agent-driven rejection (e.g. after screening / interview).
  // Candidate sees a softened message, no employer name. Employer doesn't need
  // to hear about it (they never saw the candidate) — so no template for them.
  { eventKey: "application.rejected", recipientRole: "candidate",
    title: "Application not advancing",
    body: "Your application for {{job.title}} isn't moving forward. Your agency can share feedback if you ask.",
    titleHi: "आवेदन आगे नहीं बढ़ रहा",
    bodyHi: "{{job.title}} के लिए आपका आवेदन आगे नहीं बढ़ रहा है। पूछने पर आपकी एजेंसी फ़ीडबैक दे सकती है।",
    channels: ["in_app"], hideEmployerName: true },

  // employer_rejected — candidate gets soft message, agent gets direct
  { eventKey: "application.employer_rejected", recipientRole: "candidate",
    title: "Not selected this round",
    body: "You weren't selected for {{job.title}} this time. Keep applying — new roles open every week.",
    titleHi: "इस बार चयन नहीं हुआ",
    bodyHi: "इस बार आप {{job.title}} के लिए चयनित नहीं हुए। आवेदन करते रहें — हर सप्ताह नई नौकरियाँ आती हैं।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "application.employer_rejected", recipientRole: "agent",
    title: "Employer rejected {{candidate.fullName}}",
    body: "Employer rejected {{candidate.fullName}} for {{job.title}}. Submit a substitute if possible.",
    channels: ["in_app"], hideEmployerName: false },

  // interview scheduled
  { eventKey: "interview.scheduled", recipientRole: "candidate",
    title: "Interview scheduled",
    body: "Your interview for {{job.title}} is scheduled. Check your dashboard for details.",
    titleHi: "इंटरव्यू निर्धारित हुआ",
    bodyHi: "{{job.title}} के लिए आपका इंटरव्यू निर्धारित हो गया है। विवरण के लिए अपना डैशबोर्ड देखें।",
    channels: ["in_app", "email"], hideEmployerName: true },
  { eventKey: "interview.scheduled", recipientRole: "employer",
    title: "Interview scheduled for {{candidate.fullName}}",
    body: "{{agent.agencyName}} scheduled {{candidate.fullName}} for {{job.title}}.",
    channels: ["in_app"], hideEmployerName: false },

  // interview completed → decision pending
  { eventKey: "interview.completed", recipientRole: "candidate",
    title: "Decision pending",
    body: "Your interview for {{job.title}} is complete. The agency will share the outcome soon.",
    titleHi: "निर्णय लंबित है",
    bodyHi: "{{job.title}} के लिए आपका इंटरव्यू पूरा हुआ। एजेंसी जल्द ही परिणाम बताएगी।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "interview.completed", recipientRole: "agent",
    title: "Record interview outcome",
    body: "Record the outcome of {{candidate.fullName}}'s interview for {{job.title}}.",
    channels: ["in_app"], hideEmployerName: false },
  { eventKey: "interview.completed", recipientRole: "employer",
    title: "Record interview decision",
    body: "Please confirm your decision on {{candidate.fullName}} for {{job.title}}.",
    channels: ["in_app"], hideEmployerName: false },

  // selected
  { eventKey: "application.selected", recipientRole: "candidate",
    title: "Selected — offer coming",
    body: "You've been selected for {{job.title}}! The agency will send your offer letter shortly.",
    titleHi: "चयनित — ऑफ़र आ रहा है",
    bodyHi: "आप {{job.title}} के लिए चुने गए हैं! एजेंसी जल्द ही आपका ऑफ़र लेटर भेजेगी।",
    channels: ["in_app", "email"], hideEmployerName: true },
  { eventKey: "application.selected", recipientRole: "agent",
    title: "Issue offer letter to {{candidate.fullName}}",
    body: "Employer selected {{candidate.fullName}} for {{job.title}}. Issue the offer letter.",
    channels: ["in_app"], hideEmployerName: false },

  // offer issued
  { eventKey: "offer.issued", recipientRole: "candidate",
    title: "Offer available",
    body: "Your offer letter for {{job.title}} is ready. Review and accept from your dashboard.",
    titleHi: "ऑफ़र उपलब्ध है",
    bodyHi: "{{job.title}} के लिए आपका ऑफ़र लेटर तैयार है। अपने डैशबोर्ड से देखें और स्वीकार करें।",
    channels: ["in_app", "email"], hideEmployerName: true },
  { eventKey: "offer.issued", recipientRole: "agent",
    title: "Offer sent to {{candidate.fullName}}",
    body: "Offer for {{job.title}} sent to {{candidate.fullName}}.",
    channels: ["in_app"], hideEmployerName: false },
  { eventKey: "offer.issued", recipientRole: "employer",
    title: "Appointment letter issued",
    body: "Appointment letter for {{candidate.fullName}} issued for {{job.title}}.",
    channels: ["in_app"], hideEmployerName: false },

  // offer accepted
  { eventKey: "offer.accepted", recipientRole: "candidate",
    title: "Placement confirmed",
    body: "Your placement for {{job.title}} is confirmed. Welfare check-ins will begin on departure day.",
    titleHi: "प्लेसमेंट की पुष्टि हुई",
    bodyHi: "{{job.title}} के लिए आपका प्लेसमेंट पक्का हो गया है। रवानगी के दिन से कल्याण जाँच (welfare check-in) शुरू होगी।",
    channels: ["in_app", "email"], hideEmployerName: false },
  { eventKey: "offer.accepted", recipientRole: "agent",
    title: "Placement confirmed",
    body: "{{candidate.fullName}} accepted the offer for {{job.title}}.",
    channels: ["in_app", "email"], hideEmployerName: false },
  { eventKey: "offer.accepted", recipientRole: "employer",
    title: "Candidate accepted offer",
    body: "{{candidate.fullName}} accepted your offer for {{job.title}}.",
    channels: ["in_app", "email"], hideEmployerName: false },

  // offer declined
  { eventKey: "offer.declined", recipientRole: "candidate",
    title: "You declined the offer",
    body: "You declined the offer for {{job.title}}. No further action.",
    titleHi: "आपने ऑफ़र अस्वीकार किया",
    bodyHi: "आपने {{job.title}} का ऑफ़र अस्वीकार कर दिया। किसी और कार्रवाई की आवश्यकता नहीं।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "offer.declined", recipientRole: "agent",
    title: "Candidate declined — substitute needed",
    body: "{{candidate.fullName}} declined the offer for {{job.title}}. Please submit a substitute candidate.",
    channels: ["in_app"], hideEmployerName: false },
  { eventKey: "offer.declined", recipientRole: "employer",
    title: "Candidate declined — agent will substitute",
    body: "{{candidate.fullName}} declined the offer for {{job.title}}. {{agent.agencyName}} will submit a substitute.",
    channels: ["in_app"], hideEmployerName: false },

  // job closed (manual or cascade)
  { eventKey: "job.closed", recipientRole: "candidate",
    title: "Position filled",
    body: "Thank you for applying to {{job.title}} — the position has been filled. Explore other roles on HireStream.",
    titleHi: "पद भर गया",
    bodyHi: "{{job.title}} के लिए आवेदन करने हेतु धन्यवाद — यह पद भर चुका है। HireStream पर अन्य नौकरियाँ देखें।",
    channels: ["in_app"], hideEmployerName: true },
  { eventKey: "job.closed", recipientRole: "agent",
    title: "Requisition closed",
    body: "The requisition for {{job.title}} has been closed.",
    channels: ["in_app"], hideEmployerName: false },
  { eventKey: "job.closed", recipientRole: "employer",
    title: "Job closed",
    body: "Your job {{job.title}} is now closed.",
    channels: ["in_app"], hideEmployerName: false },

  // auto-close deadline nudge
  { eventKey: "job.auto_close_nudge", recipientRole: "agent",
    title: "⚠ {{job.title}} closes in {{extra.daysLeft}} days",
    body: "Your job {{job.title}} will auto-close on the hiring deadline. Extend or close it now if plans changed.",
    channels: ["in_app"], hideEmployerName: false },
  { eventKey: "job.auto_close_nudge", recipientRole: "employer",
    title: "⚠ {{job.title}} closes in {{extra.daysLeft}} days",
    body: "Your requisition {{job.title}} will auto-close on the hiring deadline.",
    channels: ["in_app"], hideEmployerName: false },

  // requisition picked up
  { eventKey: "requisition.picked_up", recipientRole: "employer",
    title: "{{agent.agencyName}} picked up your requisition",
    body: "{{agent.agencyName}} has picked up your requisition for {{job.title}} and will start sourcing candidates.",
    channels: ["in_app"], hideEmployerName: false },

  // auto-match — new job alerts candidates whose profile matches
  { eventKey: "job.matches_your_profile", recipientRole: "candidate",
    title: "Job matching your profile: {{job.title}}",
    body: "A new role matches your skills and preferred country: {{job.title}} in {{job.location}}, {{job.country}}. Apply via your agent from your dashboard.",
    titleHi: "आपकी प्रोफ़ाइल से मेल खाती नौकरी: {{job.title}}",
    bodyHi: "एक नई नौकरी आपके कौशल और पसंदीदा देश से मेल खाती है: {{job.location}}, {{job.country}} में {{job.title}}। अपने डैशबोर्ड से एजेंट के माध्यम से आवेदन करें।",
    channels: ["in_app"], hideEmployerName: true },
];

/** Idempotent seed. Only inserts rows that don't exist for (eventKey, role). */
export async function seedNotificationTemplates(): Promise<void> {
  const db = storage.db;
  if (!db) return;

  let inserted = 0;
  let hindiBackfilled = 0;
  for (const t of DEFAULTS) {
    const existing = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventKey, t.eventKey), eq(notificationTemplates.recipientRole, t.recipientRole)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(notificationTemplates).values(t);
      inserted++;
    } else if (t.titleHi && !existing[0].titleHi && !existing[0].bodyHi) {
      // audit 2026-07-06 (Batch 4B-2): backfill Hindi variants onto rows seeded
      // before the bilingual columns existed. Only touches the Hindi columns —
      // admin edits to the English title/body are preserved — and only when both
      // Hindi columns are still empty (so an admin's Hindi edit is never clobbered).
      await db.update(notificationTemplates)
        .set({ titleHi: t.titleHi, bodyHi: t.bodyHi ?? null, updatedAt: new Date() })
        .where(and(eq(notificationTemplates.eventKey, t.eventKey), eq(notificationTemplates.recipientRole, t.recipientRole)));
      hindiBackfilled++;
    }
  }
  logger.info(`Notification templates: ${inserted} seeded, ${DEFAULTS.length - inserted} already present${hindiBackfilled ? `, ${hindiBackfilled} Hindi-backfilled` : ""}`);
}
