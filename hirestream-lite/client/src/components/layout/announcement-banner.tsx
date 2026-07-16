import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Megaphone, X, Pin, Info, CheckCircle2, AlertTriangle, AlertOctagon, Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return res.json();
}

type Severity = "info" | "positive" | "warning" | "urgent";

// Visual language matches NotificationsDrawer. Admin-chosen severity drives the
// color; no more default-amber for everything.
function severityStyle(s: Severity, pinned: boolean) {
  if (pinned) {
    return { wrap: "bg-blue-50 border-blue-200", icon: <Pin className="w-4 h-4 text-blue-600" />, title: "text-blue-900", body: "text-blue-700" };
  }
  switch (s) {
    case "positive": return { wrap: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, title: "text-emerald-900", body: "text-emerald-800" };
    case "warning":  return { wrap: "bg-amber-50 border-amber-200",    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />, title: "text-amber-900",   body: "text-amber-800" };
    case "urgent":   return { wrap: "bg-red-50 border-red-200",        icon: <AlertOctagon className="w-4 h-4 text-red-600" />,   title: "text-red-900",     body: "text-red-800" };
    default:         return { wrap: "bg-sky-50 border-sky-200",        icon: <Info className="w-4 h-4 text-sky-600" />,           title: "text-sky-900",     body: "text-sky-800" };
  }
}

const DISMISS_KEY = "hs-dismissed-announcements";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveDismissed(ids: Set<string>) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(ids))); } catch {}
}

export function AnnouncementBanner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  useEffect(() => { saveDismissed(dismissed); }, [dismissed]);

  const { data: announcementsRes } = useQuery({
    queryKey: ["/api/v1/content/announcements"],
    queryFn: () => fetchJson("/api/v1/content/announcements"),
    staleTime: 60000,
  });

  const saveForLater = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/v1/content/announcements/${id}/save`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json())?.error?.message || "Failed");
      return r.json();
    },
    onSuccess: (_body, id) => {
      // Hide the banner once saved (user can find it in the notification drawer → Saved tab)
      setDismissed((prev) => new Set(prev).add(id));
      qc.invalidateQueries({ queryKey: ["/api/v1/notifications"] });
      toast({
        title: "Saved for later",
        description: "Find it in your notifications → Saved tab.",
      });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const announcements = (announcementsRes?.data || []).filter(
    (a: any) => !dismissed.has(a.id)
  );

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {announcements.slice(0, 3).map((a: any) => {
        const style = severityStyle((a.severity ?? "info") as Severity, !!a.pinned);
        return (
          <div key={a.id} className={`rounded-lg p-4 flex items-start gap-3 border ${style.wrap}`}>
            <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-semibold ${style.title}`}>{a.title}</h4>
                {a.pinned && <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">Pinned</Badge>}
              </div>
              <p className={`text-sm mt-0.5 ${style.body}`}>{a.body}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => saveForLater.mutate(a.id)}
                disabled={saveForLater.isPending}
                className="text-gray-400 hover:text-blue-700 transition-colors p-1 rounded hover:bg-white/50"
                aria-label="Save for later"
                title="Save to your notifications → Saved tab"
              >
                <Bookmark className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDismissed(prev => new Set(prev).add(a.id))}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-white/50"
                aria-label="Dismiss announcement"
                title="Dismiss (won't show again on this device)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
