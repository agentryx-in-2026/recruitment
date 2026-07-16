import { Link } from "wouter";

export function Masthead() {
  return (
    <div className="bg-slate-900 text-white print:hidden">
      {/*
        v0.7.6.0 (a11y) — fixes FB-2026-0003.
        "Skip to Content" was a visually-styled-as-faint-text link that
        keyboard users couldn't see when focused and that was hidden on
        mobile. "Screen Reader" was a <span> that did nothing on click.
        Both are required by WCAG 2.1 Level A (2.4.1 Bypass Blocks) and
        GIGW (Guidelines for Indian Government Websites). Now:
          * Skip to Content is visually hidden by default, becomes a high-
            contrast focused chip when keyboard-focused (sr-only pattern),
            present on every viewport including mobile.
          * "Screen Reader" is a real wouter <Link> to /accessibility
            which lists supported screen-reader software + the WCAG
            conformance statement, following the standard GoI pattern.
      */}
      {/* Indian Tricolor Strip */}
      <div className="flex h-[3px]">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      {/* Skip-to-content — sr-only by default, visible on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900 focus:font-semibold text-sm"
      >
        Skip to main content
      </a>
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 flex items-center justify-between h-7">
        <span className="text-[11px] text-slate-300 truncate">
          An initiative of HPSEDC, Government of Himachal Pradesh
        </span>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <Link href="/accessibility" className="hover:text-white focus:text-white focus:outline-none focus:underline">
            Screen Reader
          </Link>
        </div>
      </div>
    </div>
  );
}
