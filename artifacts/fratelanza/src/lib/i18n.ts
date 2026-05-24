import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ar } from "./locales/ar";

const STORAGE_KEY = "fratelanza.lang";

const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
const initialLang = stored === "ar" ? "ar" : "en";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

if (typeof window !== "undefined") {
  document.documentElement.lang = initialLang;
  document.documentElement.dir = initialLang === "ar" ? "rtl" : "ltr";
}

export function setLanguage(lang: "en" | "ar") {
  void i18n.changeLanguage(lang);
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }
}

export default i18n;
