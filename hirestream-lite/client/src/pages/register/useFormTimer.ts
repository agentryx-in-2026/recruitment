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
 * ── Auto-pause when the tab is hidden ───────────────────────────────────────
 * Deliberate. Someone who opens the form and goes to find their passport should
 * not come back to "47:12" — that destroys the very message the number carries.
 * The clock counts time spent LOOKING at the form, which is the only reading a
 * candidate could check against "about four minutes".
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

export function useFormTimer(key = "hs_reg_timer") {
  const stateRef = useRef<Persisted>(EMPTY);
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

  // Mount: rehydrate. A previous session that was never frozen (tab closed
  // abruptly) leaves runningSince set — banking it would silently add all the
  // time the tab spent closed, so it is discarded rather than counted.
  useEffect(() => {
    const p = read(key);
    stateRef.current = { elapsed: p.elapsed, runningSince: null, userPaused: p.userPaused };
    if (!p.userPaused && !document.hidden) start();
    rerender();
    return () => { freeze(); };
  }, [key, start, freeze, rerender]);

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
      else if (!stateRef.current.userPaused) { start(); }
      rerender();
    };
    document.addEventListener("visibilitychange", onVis);
    // Last-chance save — `unload` is unreliable on mobile, `pagehide` is not.
    window.addEventListener("pagehide", freeze);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", freeze);
    };
  }, [freeze, start, rerender]);

  const paused = stateRef.current.userPaused;

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s.userPaused) {
      stateRef.current = { ...s, userPaused: false };
      start();
    } else {
      freeze();
      stateRef.current = { ...stateRef.current, userPaused: true };
      persist();
    }
    rerender();
  }, [start, freeze, persist, rerender]);

  const total = Math.max(0, Math.floor(totalMs() / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const label = hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  return { label, paused, toggle };
}
