import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import hi from "../locales/hi.json";

// Get saved language preference
const savedLang = typeof window !== "undefined" ? localStorage.getItem("hirestream-lang") || "en" : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

// Restore saved font size (GIGW accessibility)
if (typeof window !== "undefined") {
  const savedFont = localStorage.getItem("hs-font");
  if (savedFont) document.documentElement.style.fontSize = savedFont + "px";
}

export default i18n;
