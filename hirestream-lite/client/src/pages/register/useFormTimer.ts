/**
 * A registration timer that survives leaving, and can be paused.
 *
 * ── Why it had to change ────────────────────────────────────────────────────
 * The first version was `startedAt = Date.now()` on mount, so the clock reset to
 * 00:00 on every reload and every return visit. That is worse than useless for
 * the thing it is there to do: the number exists to show a candidate this form
 * is genuinely short (HPSEDC's complaint was that registration felt endless), and
 * a number that silently restarts is not evidence of anything.
 *
 * ── Why localStorage and not the server ─────────────────────────────────────
 * This is a comfort reading for one person on one device, not application data.
 * A column plus a write on every tick would be real cost for no gain — and if a
 * candidate does move device, restarting the clock is the honest answer anyway,
 * because we genuinely do not know how long they spent on the other one.
 *
 * ── What counts as "time spent" ─────────────────────────────────────────────
 * Only time actually spent LOOKING at the form. The clock stops when:
 *   · the tab is hidden, or the browser loses focus entirely (alt-tabbing to
 *     another application does not always fire visibilitychange; blur does)
 *   · nothing has been touched for IDLE_MS — they went to find their passport,
 *     or someone came to the door
 *   · the candidate presses Pause
 *   · they sign out, or the form unmounts
 *
 * Anything looser lets "about four minutes" quietly become 47:12, which
 * destroys the only message the number carries.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Persisted {
  /** Milliseconds banked from previous runs. */
  elapsed: number;
  /** Epoch ms the current run began, or null when paused/stopped. */
  runningSince: number | null;
  /** The candidate pressed Pause — survives a reload, unlike an auto-pause. */
  userPaused: boolean;
}

const EMPTY: Persisted = { elapsed: 0, runningSince: null, userPaused: false };

/** No keyboard, mouse or touch for this long and the clock stops by itself. */
const IDLE_MS = 90_000;

function read(key: string): Persisted {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Persisted;
    if (typeof p?.elapsed !== "number") return EMPTY;
    return { elapsed: p.elapsed, runningSince: p.runningSince ?? null, userPaused: !!p.userPaused };
  } catch { return EMPTY; }
}

function write(key: string, p: Persisted) {
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* private mode — timer just won't persist */ }
}

/**
 * @param candidateId scopes the clock to one person. It used to be a single
 *   global slot, so two candidates registering on the same machine — a
 *   cyber-cafe, a panchayat office, a shared phone, which is how a great many
 *   HPSEDC applicants reach this form — shared one timer and each inherited the
 *   other's minutes.
 */
export function useFormTimer(candidateId?: string | null) {
  const key = `hs_reg_timer:${candidateId || "anon"}`;
  const stateRef = useRef<Persisted>(EMPTY);
  const idleRef = useRef<number | null>(null);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // Total elapsed right now = banked + the run in progress.
  const totalMs = useCallback(() => {
    const s = stateRef.current;
    return s.elapsed + (s.runningSince ? Date.now() - s.runningSince : 0);
  }, []);

  const persist = useCallback(() => write(key, stateRef.current), [key]);

  /** Bank the current run and stop counting. */
  const freeze = useCallback(() => {
    const s = stateRef.current;
    if (s.runningSince) {
      stateRef.current = { ...s, elapsed: s.elapsed + (Date.now() - s.runningSince), runningSince: null };
      persist();
    }
  }, [persist]);

  const start = useCallback(() => {
    const s = stateRef.current;
    if (!s.runningSince) {
      stateRef.current = { ...s, runningSince: Date.now() };
      persist();
    }
  }, [persist]);

  /** Restart the idle countdown; called on any real interaction. */
  const bumpIdle = useCallback(() => {
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      // An idle pause is automatic, so it deliberately does NOT set userPaused:
      // the next keystroke resumes the clock without the candidate having to
      // notice a button or understand why it stopped.
      freeze();
      rerender();
    }, IDLE_MS);
  }, [freeze, rerender]);

  // Mount: rehydrate. A previous session that was never frozen (tab closed
  // abruptly) leaves runningSince set — banking it would silently add all the
  // time the tab spent closed, so it is discarded rather than counted.
  useEffect(() => {
    const p = read(key);
    stateRef.current = { elapsed: p.elapsed, runningSince: null, userPaused: p.userPaused };
    if (!p.userPaused && !document.hidden) { start(); bumpIdle(); }
    rerender();
    return () => {
      freeze();
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [key, start, freeze, rerender, bumpIdle]);

  // Any genuine interaction resumes the clock (unless deliberately paused) and
  // restarts the idle countdown.
  useEffect(() => {
    const onActivity = () => {
      if (!stateRef.current.userPaused && !document.hidden) start();
      bumpIdle();
    };
    const events: (keyof WindowEventMap)[] = ["keydown", "mousedown", "touchstart", "scroll"];
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    return () => { for (const e of events) window.removeEventListener(e, onActivity); };
  }, [start, bumpIdle]);

  // Tick.
  useEffect(() => {
    const id = setInterval(rerender, 1000);
    return () => clearInterval(id);
  }, [rerender]);

  // Auto-pause on tab hide; auto-resume on return unless the candidate paused
  // deliberately, in which case their choice wins.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { freeze(); }
      else if (!stateRef.current.userPaused) { start(); bumpIdle(); }
      rerender();
    };
    const onBlur = () => { freeze(); rerender(); };
    document.addEventListener("visibilitychange", onVis);
    // Switching to another APPLICATION does not reliably fire visibilitychange;
    // blur does, so alt-tabbing out of the browser still stops the clock.
    window.addEventListener("blur", onBlur);
    // Last-chance save — `unload` is unreliable on mobile, `pagehide` is not.
    window.addEventListener("pagehide", freeze);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", freeze);
    };
  }, [freeze, start, rerender, bumpIdle]);

  // Reported as paused whenever the clock is not actually running — an idle or
  // blur pause must LOOK paused, or the candidate sees a frozen number and
  // assumes it is broken.
  const paused = stateRef.current.userPaused || !stateRef.current.runningSince;

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s.userPaused || !s.runningSince) {
      stateRef.current = { ...s, userPaused: false };
      start();
      bumpIdle();
    } else {
      freeze();
      stateRef.current = { ...stateRef.current, userPaused: true };
      persist();
    }
    rerender();
  }, [start, freeze, persist, rerender, bumpIdle]);

  /** Back to zero and counting again — for a clean measured run. */
  const reset = useCallback(() => {
    stateRef.current = { elapsed: 0, runningSince: Date.now(), userPaused: false };
    persist();
    bumpIdle();
    rerender();
  }, [persist, rerender, bumpIdle]);

  const total = Math.max(0, Math.floor(totalMs() / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const label = hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  return { label, paused, toggle, reset };
}
