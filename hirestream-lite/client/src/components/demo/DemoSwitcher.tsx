/**
 * Floating Demo Switcher — lets the presenter jump between cast members from
 * ANY page without returning to the login screen. Draggable (grab the grip) so
 * it can be parked anywhere it's not blocking content; position is remembered.
 * Only renders when `feature.quick_login_enabled` is on and a user is logged in.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DEMO_CAST } from "@shared/demo-cast";
import { DemoCastTabs, useDemoLogin, DemoResetButton } from "./demo-cast-ui";
import { Clapperboard, X, ChevronDown, GripVertical } from "lucide-react";

const STORAGE_KEY = "demoSwitcherPos";

function findMember(username?: string) {
  if (!username) return undefined;
  for (const tab of Object.values(DEMO_CAST))
    for (const m of tab) if (m.username === username) return m;
  return undefined;
}

export function DemoSwitcher() {
  const { user } = useAuth();
  const { login, loadingUser } = useDemoLogin();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/auth/dev-login", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setEnabled(!!d?.data?.enabled); })
      .catch(() => {});
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setPos(JSON.parse(s)); } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, []);

  // Keep it on-screen if the window is resized smaller.
  useEffect(() => {
    const onResize = () => setPos((p) => {
      if (!p || !ref.current) return p;
      const r = ref.current.getBoundingClientRect();
      return { x: Math.max(4, Math.min(p.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(p.y, window.innerHeight - r.height - 4)) };
    });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!enabled || !user) return null;
  const username = (user as any).username as string | undefined;
  const current = findMember(username);
  const label = current?.name ?? username ?? "Demo user";

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      const x = Math.max(4, Math.min(window.innerWidth - w - 4, ev.clientX - offX));
      const y = Math.max(4, Math.min(window.innerHeight - h - 4, ev.clientY - offY));
      setPos({ x, y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPos((p) => { if (p) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ } return p; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Anchor the panel toward whichever edge has room, so it never overflows.
  const openUp = !pos || pos.y > window.innerHeight / 2;
  const anchorRight = !pos || pos.x + 120 > window.innerWidth / 2;
  const containerStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 16, bottom: 16 };

  const panel = (
    <div className={`absolute w-80 rounded-xl border border-slate-200 bg-white shadow-2xl p-3
      ${openUp ? "bottom-full mb-2" : "top-full mt-2"} ${anchorRight ? "right-0" : "left-0"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Switch demo cast</p>
          <p className="text-xs font-semibold text-slate-700 truncate">
            Logged in as {label}{current ? ` · ${current.status}` : ""}
          </p>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <DemoCastTabs onLogin={login} loadingUser={loadingUser} currentUsername={username} />
      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
        <DemoResetButton className="w-full" />
      </div>
    </div>
  );

  return (
    <div ref={ref} style={containerStyle} className="fixed z-[9999] print:hidden">
      {open && panel}
      <div className="flex items-stretch shadow-lg rounded-full">
        <button
          onPointerDown={startDrag}
          title="Drag to move"
          aria-label="Drag to move"
          className="flex items-center px-1.5 rounded-l-full bg-slate-800 text-slate-400 hover:text-white border-r border-slate-700 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-r-full bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <Clapperboard className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold max-w-[150px] truncate">Demo: {label}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>
  );
}
