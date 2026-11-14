import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, LogOut, Home as HomeIcon, Map, FolderOpen } from "lucide-react";
import { api } from "../lib/api";
import { ROADMAP } from "@shared/roadmap";

export function Header() {
  const [reviewer, setReviewer] = useState<any>(null);
  const [routePath] = useLocation();
  const isHome = routePath === "/";

  useEffect(() => { api.me().then(({ reviewer }) => setReviewer(reviewer)).catch(() => {}); }, []);

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-[1500px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-agentryx-700 hover:text-agentryx-900">
            <CheckCircle2 className="w-5 h-5" />
            <span>Agentryx <span className="font-light">Verify</span></span>
          </Link>
          {/* Live build badge — single source of truth is shared/roadmap.ts.
              For admin/delivery the badge links to the Roadmap dashboard so
              they can drill from "what's running" to "what's next". For other
              reviewers it's plain text — informational, not interactive. */}
          {reviewer && (reviewer.role === "admin" || reviewer.role === "delivery") ? (
            <Link href="/admin/roadmap"
              className="text-[10px] font-mono font-semibold tracking-wide text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 px-1.5 py-0.5 rounded transition"
              title="Click to open the product roadmap dashboard">
              {ROADMAP.currentVersion}
            </Link>
          ) : (
            <span className="text-[10px] font-mono font-medium tracking-wide text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded"
              title="Current build of Agentryx Verify">
              {ROADMAP.currentVersion}
            </span>
          )}
          {/* Explicit Home link — the wordmark alone wasn't being read as
              clickable by reviewers who'd drilled into a project. Hidden on
              the Home page itself so it doesn't loop back to the same view. */}
          {!isHome && (
            <Link href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-agentryx-700 px-2 py-1 rounded border border-slate-200 hover:border-agentryx-300 hover:bg-slate-50 transition"
              title="Back to projects list">
              <HomeIcon className="w-3.5 h-3.5" />
              All projects
            </Link>
          )}
          {/* Admin/delivery shortcut to the strategic roadmap dashboard.
              Reviewers without admin scope don't see this link; the route
              also redirects them away on direct visit. */}
          {reviewer && (reviewer.role === "admin" || reviewer.role === "delivery") && routePath !== "/admin/roadmap" && (
            <Link href="/admin/roadmap"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 px-2 py-1 rounded border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition"
              title="Product roadmap dashboard (admin only)">
              <Map className="w-3.5 h-3.5" />
              Roadmap
            </Link>
          )}
          {/* Product Management library — every signed-in reviewer; the page
              itself shows only the documents shared with their role. */}
          {reviewer && routePath !== "/product" && (
            <Link href="/product"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-agentryx-700 px-2 py-1 rounded border border-slate-200 hover:border-agentryx-300 hover:bg-slate-50 transition"
              title="Contract, requirements, design and training documents">
              <FolderOpen className="w-3.5 h-3.5" />
              Product Management
            </Link>
          )}
        </div>
        <div className="text-sm">
          {reviewer ? (
            <div className="flex items-center gap-3">
              {/* Wrap the reviewer name in a Home link too, so clicking the
                  identifier returns to the projects list. Reviewers reported
                  expecting their own name to be a "back to dashboard" affordance. */}
              <Link href="/"
                className="text-slate-600 hover:text-agentryx-700 hover:underline"
                title="Back to projects list">
                {reviewer.name} · <span className="text-slate-400">{reviewer.organization}</span>
              </Link>
              <button
                onClick={async () => { await api.logout(); location.reload(); }}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
              ><LogOut className="w-4 h-4" /> Sign out</button>
            </div>
          ) : (
            <Link href="/login" className="text-agentryx-600 hover:underline">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
