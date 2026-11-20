import { Smartphone } from "lucide-react";
import { Shell, Page } from "../components/Shell";

/**
 * How to open the HireStream mobile app on a phone (Expo Go).
 * The steps used to live only on the old mobile project page, which the
 * Dashboard no longer links to — so testers could not find the QR code.
 */
export const MOBILE_URL = "exps://hirestream-mobile.agentryx.dev";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#14213D] text-white text-xs font-bold flex items-center justify-center">{n}</span>
      <span className="text-sm text-slate-700">{children}</span>
    </li>
  );
}

export function MobileAppCard() {
  return (
    <div className="grid gap-5 lg:grid-cols-[auto_1fr_1fr] items-start">
      <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
        <img src="/qr-mobile.png" alt={`QR code for ${MOBILE_URL}`} width={200} height={200} className="mx-auto rounded-lg border border-slate-200" />
        <p className="mt-3 text-xs text-slate-500">Scan with Expo Go (Android)</p>
        <code className="mt-2 block select-all rounded bg-slate-100 px-2 py-1.5 text-sm font-mono text-slate-800 break-all">{MOBILE_URL}</code>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Android</h2>
        <ol className="mt-3 space-y-2.5">
          <Step n={1}>Install <b>Expo Go</b> from the Google Play Store (free).</Step>
          <Step n={2}>Open Expo Go and tap <b>Scan QR code</b>, then scan the code on the left — or tap <b>Enter URL manually</b> and type <code className="font-mono text-xs">{MOBILE_URL}</code>.</Step>
          <Step n={3}>Wait 15–30 seconds the first time while the app loads, then sign in with a test account (see <b>Test accounts</b> at the top).</Step>
        </ol>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">iPhone</h2>
        <ol className="mt-3 space-y-2.5">
          <Step n={1}>Install <b>Expo Go</b> from the App Store (free).</Step>
          <Step n={2}>Open <b>Safari</b> (not Expo Go) and type <code className="font-mono text-xs">{MOBILE_URL}</code> in the address bar. The QR code does not work on iPhone.</Step>
          <Step n={3}>Tap <b>Open</b> when asked “Open this page in Expo Go?”. The app loads in 15–30 seconds.</Step>
        </ol>
        <p className="mt-4 text-xs text-slate-500">Won’t load? Close Expo Go completely and try again. Usernames are lowercase.</p>
      </section>
    </div>
  );
}

export function MobileApp() {
  return (
    <Shell title="Mobile app">
      <Page title="Mobile app — open it on your phone"
        sub="The HireStream mobile app runs in the free Expo Go app. The mobile cases are for a later phase; use this when a mobile case asks you to.">
        <MobileAppCard />
      </Page>
    </Shell>
  );
}

export const MobileIcon = Smartphone;
