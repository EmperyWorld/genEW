import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ru from "./locales/ru/common.json";
import en from "./locales/en/common.json";

export const LOCALE_STORAGE_KEY = "ecc.locale";
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

const initialLng: AppLocale = readStoredLocale() ?? "ru";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { common: ru },
      en: { common: en },
    },
    defaultNS: "common",
    ns: ["common"],
    lng: initialLng,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LOCALES],
    detection: {
      // Persist choice only; default is explicit ru above (not browser-first).
      order: ["localStorage"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    syncDocumentLang(i18n.language);
  });

export function syncDocumentLang(lng: string): void {
  const base = (lng.split("-")[0] || "ru") as string;
  if (typeof document === "undefined") return;
  document.documentElement.lang = base;
  const title = i18n.t("shell.documentTitle", { lng: base });
  if (title && title !== "shell.documentTitle") {
    document.title = title;
  }
}

i18n.on("languageChanged", (lng) => {
  syncDocumentLang(lng);
});

export default i18n;
