// audit 2026-07-06 (Batch 3): replaced the developer-joke copy ("Did you forget
// to add the page to the router?") with translated, citizen-friendly copy and
// a way home. Wired to the new notFound.* namespace.
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 — {t("notFound.title")}</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {t("notFound.desc")}
          </p>

          <Link href="/">
            <Button className="mt-6 w-full">
              <Home className="w-4 h-4 mr-2" /> {t("notFound.goHome")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
