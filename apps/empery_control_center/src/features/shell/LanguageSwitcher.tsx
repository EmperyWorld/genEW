import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  type AppLocale,
  syncDocumentLang,
} from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const active = (i18n.resolvedLanguage?.split("-")[0] ||
    i18n.language?.split("-")[0] ||
    "ru") as AppLocale;

  const setLocale = (lng: AppLocale) => {
    void i18n.changeLanguage(lng).then(() => {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, lng);
      } catch {
        /* ignore quota / private mode */
      }
      syncDocumentLang(lng);
    });
  };

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="inline-flex items-center gap-0.5 rounded-sm border border-line bg-panel px-0.5 py-0.5"
    >
      {SUPPORTED_LOCALES.map((lng, idx) => (
        <span key={lng} className="inline-flex items-center">
          {idx > 0 ? (
            <span className="mx-0.5 h-3 w-px bg-line" aria-hidden />
          ) : null}
          <button
            type="button"
            onClick={() => setLocale(lng)}
            className={cn(
              "rounded-sm px-2 py-0.5 font-mono text-[11px] tracking-wide transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecc-focus-ring)]",
              active === lng
                ? "border border-signal/50 text-signal"
                : "border border-transparent text-ink-muted hover:text-ink",
            )}
            aria-pressed={active === lng}
          >
            {t(`language.${lng}`)}
          </button>
        </span>
      ))}
    </div>
  );
}
