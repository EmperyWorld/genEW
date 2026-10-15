import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import enChrome from "./locales/en/desktopChrome.json";
import enApps from "./locales/en/desktopApps.json";
import ruChrome from "./locales/ru/desktopChrome.json";
import ruApps from "./locales/ru/desktopApps.json";

export const LOCALE_STORAGE_KEY = "empery.desktop.locale";
export const SUPPORTED_LOCALES = ["ru", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

function readStoredLocale(): AppLocale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "ru" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function syncDocumentLang(lng: string): void {
  const lang = lng.startsWith("ru") ? "ru" : "en";
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

const initialLng: AppLocale = readStoredLocale() ?? "ru";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { desktopChrome: ruChrome, desktopApps: ruApps },
      en: { desktopChrome: enChrome, desktopApps: enApps },
    },
    defaultNS: "desktopChrome",
    ns: ["desktopChrome", "desktopApps"],
    lng: initialLng,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LOCALES],
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    syncDocumentLang(i18n.language);
  });

i18n.on("languageChanged", syncDocumentLang);

export default i18n;
