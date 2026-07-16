import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpCircle, Search, ChevronDown, ChevronUp, Smartphone, Download, ExternalLink, CheckCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return { data: [] };
  return res.json();
}

export default function FaqPage() {
  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const { t } = useTranslation();

  const { data: faqRes, isLoading } = useQuery({
    queryKey: ["/api/v1/content/faq"],
    queryFn: () => fetchJson("/api/v1/content/faq"),
  });

  const allFaqs = faqRes?.data || [];

  // Filter by search
  const filtered = search
    ? allFaqs.filter((f: any) =>
        f.question.toLowerCase().includes(search.toLowerCase()) ||
        f.answer.toLowerCase().includes(search.toLowerCase())
      )
    : allFaqs;

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const faq of filtered) {
    const cat = faq.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(faq);
  }

  const categoryLabels: Record<string, string> = {
    registration: "Registration & Account",
    job_application: "Job Application",
    agencies: "Recruitment Agencies",
    overseas_placement: "Overseas Placement",
    technical_support: "Technical Support",
    general: "General",
  };

  const toggle = (id: string) => {
    const next = new Set(openItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenItems(next);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <HelpCircle className="w-12 h-12 text-blue-600 mx-auto mb-3" />
        <h1 className="text-3xl font-bold text-gray-900">{t("faq.title")}</h1>
        <p className="text-gray-500 mt-2">{t("faq.subtitle")}</p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
        <Input
          placeholder={t("faq.searchPlaceholder")}
          className="pl-11 h-12 text-base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Mobile App quick-start panel — the Play Store listing isn't live
          yet, so the app ships via Expo Go pointing at a branded URL.
          Anyone on this page (candidates, agency staff, HPSEDC testers)
          can install + connect in under 2 minutes. */}
      <div className="mb-10 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <h2 className="text-lg font-bold text-slate-900">Using the HireStream Mobile App</h2>
            <p className="text-sm text-slate-600 mt-1">
              Install <strong>Expo Go</strong> from the Play Store, then connect to the HireStream URL below to load the app on your phone. No APK install needed.
            </p>
            <div className="mt-3 bg-white border border-indigo-200 rounded-lg px-3 py-2 font-mono text-sm text-indigo-700 break-all select-all">
              exps://hirestream-mobile.agentryx.dev
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/docs/HireStream_Mobile_Quick_Testing_Guide.pdf" target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition">
                <Download className="w-4 h-4" /> Mobile App Guide (PDF)
              </a>
              <a href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700 transition">
                <ExternalLink className="w-4 h-4" /> Install Expo Go
              </a>
            </div>
          </div>
        </div>

        {/* How to check version + force-refresh — same info as the PDF
            page 3, surfaced inline because most users won't open the
            PDF until they hit a problem. */}
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-lg border border-indigo-100 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Confirm you're on the latest build</h3>
            </div>
            <ol className="text-[12px] text-slate-700 list-decimal pl-5 space-y-1">
              <li>Open Expo Go → tap the HireStream entry → wait for the app to load.</li>
              <li>Tap the <strong>Applications</strong> tab at the bottom.</li>
              <li>Look at the <strong>top-right of the dark blue header</strong>. A small grey version tag appears, e.g. <code className="font-mono bg-slate-100 px-1 rounded text-[11px]">v0.4.16.0</code>.</li>
              <li>Today's build is <strong className="text-emerald-700">v0.4.16.0</strong>. If you see an older number, follow the force-refresh steps →</li>
            </ol>
          </div>
          <div className="bg-white rounded-lg border border-amber-200 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <RefreshCw className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Force-refresh the bundle</h3>
            </div>
            <ol className="text-[12px] text-slate-700 list-decimal pl-5 space-y-1">
              <li>Open Expo Go on your phone.</li>
              <li><strong>Long-press</strong> the HireStream entry in the recent projects list.</li>
              <li>Tap <strong>"Remove from list"</strong> — this clears the cached manifest.</li>
              <li>Tap <strong>"Enter URL manually"</strong> at the bottom.</li>
              <li>Paste <code className="font-mono bg-slate-100 px-1 rounded text-[11px] break-all">exps://hirestream-mobile.agentryx.dev</code> → Connect.</li>
              <li>Fresh download takes ~30s. Re-check the version tag.</li>
            </ol>
          </div>
        </div>
      </div>

      {allFaqs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <HelpCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No FAQs available yet</p>
          <p className="text-sm mt-1">FAQs will be added by the administrator</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No results for "{search}"</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, faqs]) => (
            <div key={category}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{categoryLabels[category] || category}</Badge>
                <span className="text-sm text-gray-400">{faqs.length}</span>
              </h2>
              <div className="space-y-2">
                {faqs.map((faq: any) => (
                  <div key={faq.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggle(faq.id)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900 pr-4">{faq.question}</span>
                      {openItems.has(faq.id) ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                    {openItems.has(faq.id) && (
                      <div className="px-5 pb-4 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
