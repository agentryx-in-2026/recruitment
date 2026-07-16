/**
 * NotificationsDrawer — the header bell opens a right-side drawer with two
 * tabs: Active (current) and Saved (bookmarked for later).
 *
 * Replaces the older amber-heavy popover. Each item has two explicit actions:
 *   • ✕ Dismiss  — never resurfaces for this user
 *   • 🔖 Save    — moves to Saved (toggle). From Saved, the same icon unsaves.
 *
 * Severity drives color, not the type:
 *   info      → sky-blue  (default, non-alarming)
 *   positive  → emerald   (shortlist, offer, selected)
 *   warning   → amber     (deadline, minor issue)
 *   urgent    → red       (rejection, position filled)
 *
 * Used for candidate, agent, employer — role-agnostic.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Bell, X, Bookmark, CheckCheck, Inbox, Archive, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

type Severity = "info" | "positive" | "warning" | "urgent";
interface Notif {
  id: string; type: string; title: string; message: string;
  severity: Severity; createdAt?: string;
  savedAt?: string | null; dismissedAt?: string | null;
  read?: boolean;
  metadata?: Record<string, any> | null;
}

// notif 2026-07-16: resolve a notification to the page it's about, so the bell
// stops being a dead end ("your visa status changed" → the actual application).
//
// Returns null when there's nothing to open, and the card then stays
// non-clickable — deliberate. ~2/3 of existing rows (older `system` and
// `application_update` ones) carry NULL metadata, and a link that goes nowhere
// is worse than no link. Only the ids below have real routes in App.tsx; do not
// invent targets for driveId on the candidate side — they have no drive route.
function notifLink(n: Notif, role?: string): string | null {
  const m = n.metadata;
  if (!m) return null;
  if (role === "candidate") {
    if (m.applicationId) return `/applications/${m.applicationId}`;
    if (m.jobId) return `/jobs/${m.jobId}`;
    return null;
  }
  if (role === "agent" || role === "admin" || role === "superadmin") {
    if (m.driveId) return `/agent/drives/${m.driveId}`;
    if (m.candidateId) return `/agent/candidates/${m.candidateId}`;
    if (m.jobId) return `/agent/jobs/${m.jobId}`;
    return null;
  }
  return null;
}

function severityStyle(s: Severity) {
  switch (s) {
    case "positive": return { border: "border-emerald-200", bg: "bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-900" };
    case "warning":  return { border: "border-amber-200",   bg: "bg-amber-50",   dot: "bg-amber-500",   text: "text-amber-900" };
    case "urgent":   return { border: "border-red-200",     bg: "bg-red-50",     dot: "bg-red-500",     text: "text-red-900" };
    default:         return { border: "border-sky-200",     bg: "bg-sky-50",     dot: "bg-sky-500",     text: "text-sky-900" };
  }
}

// audit 2026-07-06 (Batch 3): relative times were hardcoded English; module-level
// i18n instance works outside a component render (re-renders pick up language switches).
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return i18n.t("notif.justNow");
  if (m < 60) return i18n.t("notif.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return i18n.t("notif.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return i18n.t("notif.daysAgo", { count: d });
}

export function NotificationsDrawer() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"active" | "saved">("active");

  const { data: res } = useQuery({
    queryKey: ["/api/v1/notifications", tab],
    queryFn: async () => {
      const r = await fetch(`/api/v1/notifications?view=${tab}&limit=50`);
      if (!r.ok) return { data: [], unreadCount: 0, savedCount: 0 };
      return r.json();
    },
    refetchInterval: open ? 1000 * 30 : 1000 * 60,
  });

  const items: Notif[] = res?.data ?? [];
  const unread = res?.unreadCount ?? 0;
  const savedCount = res?.savedCount ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/v1/notifications"] });

  const post = async (url: string, errLabel: string) => {
    const r = await fetch(url, { method: "POST" });
    if (!r.ok) throw new Error(errLabel);
  };
  const dismissOne = useMutation({
    mutationFn: (id: string) => post(`/api/v1/notifications/${id}/dismiss`, "Couldn't dismiss notification"),
    onSuccess: invalidate,
  });
  const toggleSave = useMutation({
    mutationFn: (id: string) => post(`/api/v1/notifications/${id}/save`, "Couldn't update saved notification"),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => post(`/api/v1/notifications/mark-all-read`, "Couldn't mark all read"),
    onSuccess: invalidate,
  });
  const dismissAll = useMutation({
    mutationFn: () => post(`/api/v1/notifications/dismiss-all`, "Couldn't dismiss all"),
    onSuccess: invalidate,
  });

  // notif 2026-07-16: clicking a notification navigates to what it's about,
  // marks it read, and closes the drawer. Navigation is NOT gated on the
  // mark-read call — a failed PATCH must not strand the user in the drawer.
  const openNotif = (n: Notif) => {
    const href = notifLink(n, user?.role);
    if (!href) return;
    if (!n.read) {
      fetch(`/api/v1/notifications/${n.id}/read`, { method: "PATCH" })
        .then(invalidate)
        .catch(() => {});
    }
    setOpen(false);
    setLocation(href);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label={t("notif.bellAria", { count: unread })}
        >
          <Bell className="w-5 h-5 text-gray-600" />
          {unread > 0 && (
            <>
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unread > 9 ? "9+" : unread}
              </span>
              <span className="absolute -top-0.5 -right-0.5 bg-red-500/40 rounded-full min-w-[18px] h-[18px] animate-ping" />
            </>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-slate-200">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="w-5 h-5 text-slate-700" /> {t("notif.title")}
          </SheetTitle>
          <div className="flex gap-1 mt-3 bg-slate-100 rounded-lg p-1 text-xs">
            <button onClick={() => setTab("active")}
              className={`flex-1 px-3 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 ${
                tab === "active" ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-600 hover:text-slate-900"
              }`}>
              <Inbox className="w-3.5 h-3.5" /> {t("notif.tabActive")}
              {unread > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{unread}</span>}
            </button>
            <button onClick={() => setTab("saved")}
              className={`flex-1 px-3 py-1.5 rounded-md transition flex items-center justify-center gap-1.5 ${
                tab === "saved" ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-600 hover:text-slate-900"
              }`}>
              <Archive className="w-3.5 h-3.5" /> {t("notif.tabSaved")}
              {savedCount > 0 && <span className="bg-slate-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{savedCount}</span>}
            </button>
          </div>
        </SheetHeader>

        {tab === "active" && items.length > 0 && (
          <div className="px-5 py-2 flex gap-2 border-b border-slate-100 bg-slate-50/50">
            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-slate-600 hover:text-slate-900"
              onClick={() => markAllRead.mutate()}>
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> {t("notif.markAllRead")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-slate-600 hover:text-slate-900"
              onClick={() => { if (window.confirm(t("notif.dismissAllConfirm"))) dismissAll.mutate(); }}>
              <X className="w-3.5 h-3.5 mr-1" /> {t("notif.dismissAll")}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  inSavedTab={tab === "saved"}
                  onDismiss={() => dismissOne.mutate(n.id)}
                  onToggleSave={() => toggleSave.mutate(n.id)}
                  onOpen={notifLink(n, user?.role) ? () => openNotif(n) : undefined}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400 text-center">
          {tab === "active" ? t("notif.footerActive") : t("notif.footerSaved")}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationCard({ n, inSavedTab, onDismiss, onToggleSave, onOpen }: {
  n: Notif; inSavedTab: boolean; onDismiss: () => void; onToggleSave: () => void; onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const style = severityStyle(n.severity);
  const isSaved = !!n.savedAt;
  // Only the title+body area is the click target — Save/Dismiss stay separate
  // buttons underneath, so opening never fights dismissing.
  const Body = onOpen ? "button" : "div";
  return (
    <li className={`px-5 py-3 ${style.bg} border-l-4 ${style.border}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
        <div className="flex-1 min-w-0">
          <Body
            {...(onOpen ? { onClick: onOpen, type: "button" as const } : {})}
            className={`w-full text-left block ${onOpen ? "group cursor-pointer" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-semibold ${style.text} truncate ${onOpen ? "group-hover:underline" : ""}`}>{n.title}</p>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{n.message}</p>
            {onOpen && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-700 mt-1 group-hover:gap-1.5 transition-all">
                {t("notif.open")} <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </Body>
          <div className="flex gap-1 mt-2">
            <button onClick={onToggleSave}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded ${
                isSaved ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400"
              }`}
              title={isSaved ? t("notif.unsaveTitle") : t("notif.saveTitle")}>
              <Bookmark className="w-3 h-3" />
              {isSaved ? (inSavedTab ? t("notif.unsave") : t("notif.saved")) : t("notif.save")}
            </button>
            <button onClick={onDismiss}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-700"
              title={t("notif.dismissTitle")}>
              <X className="w-3 h-3" /> {t("notif.dismiss")}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ tab }: { tab: "active" | "saved" }) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-10">
      {tab === "active" ? (
        <>
          <Inbox className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-700">{t("notif.emptyActive")}</p>
          <p className="text-xs text-slate-500 mt-1">{t("notif.emptyActiveDesc")}</p>
        </>
      ) : (
        <>
          <Archive className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-700">{t("notif.emptySaved")}</p>
          <p className="text-xs text-slate-500 mt-1">{t("notif.emptySavedDesc")}</p>
        </>
      )}
    </div>
  );
}
