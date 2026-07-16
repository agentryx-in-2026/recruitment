import { Globe } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

export function Footer() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  // Single source of truth — server reads /VERSION at boot and exposes it
  // here. Bumping a release is `echo 0.4.2.0 > VERSION && pm2 restart`,
  // no rebuild needed on the client.
  const { data: verRes } = useQuery({
    queryKey: ["/api/v1/version"],
    queryFn: async () => {
      const r = await fetch("/api/v1/version");
      if (!r.ok) return { data: { version: "?.?.?.?" } };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const appVersion: string = verRes?.data?.version ?? "?.?.?.?";

  return (
    <footer className="bg-gray-900 text-white mt-16">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-8 2xl:px-12 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Globe className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-bold">HireStream</h3>
              <span className="text-[10px] font-mono text-gray-500 bg-gray-800/60 border border-gray-700 rounded px-1.5 py-0.5" title="Build version — read from /VERSION at server boot">
                v{appVersion}
              </span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              HPSEDC Overseas Placement Portal. A Government of Himachal Pradesh initiative for safe, regulated international employment.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-gray-200">{t("footer.forCandidates")}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><button onClick={() => setLocation("/auth")} className="hover:text-white transition-colors">{t("footer.register")}</button></li>
              <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">{t("footer.browseJobs")}</button></li>
              <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">{t("footer.trackApplications")}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-gray-200">{t("footer.forAgencies")}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><button onClick={() => setLocation("/auth")} className="hover:text-white transition-colors">{t("footer.registerAgency")}</button></li>
              <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">{t("footer.postJobs")}</button></li>
              <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">{t("footer.manageDrives")}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-gray-200">{t("footer.support")}</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><button onClick={() => setLocation("/faq")} className="hover:text-white transition-colors">{t("nav.faq")}</button></li>
              <li><button onClick={() => setLocation("/grievances")} className="hover:text-white transition-colors">{t("footer.fileGrievance")}</button></li>
              <li>
                <a href="/docs/HireStream_Mobile_Quick_Testing_Guide.pdf" target="_blank" rel="noopener noreferrer"
                   className="hover:text-white transition-colors inline-flex items-center gap-1">
                  Mobile App Guide (PDF)
                </a>
              </li>
              <li><button onClick={() => setLocation("/")} className="hover:text-white transition-colors">{t("footer.contactHPSEDC")}</button></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-6 text-center text-gray-500 text-xs">
          <p>&copy; {new Date().getFullYear()} {t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
