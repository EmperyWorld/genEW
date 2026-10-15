import i18n from "@/i18n";

/** Localized app title by app_component; falls back to catalog/bootstrap name. */
export function displayAppTitle(
  appComponent: string | null | undefined,
  fallbackName: string,
): string {
  const key = (appComponent || "").trim();
  if (!key) return shortLabel(fallbackName);
  const translated = i18n.t(key, {
    ns: "desktopApps",
    defaultValue: "",
  });
  if (translated && translated !== key) return shortLabel(translated);
  return shortLabel(fallbackName);
}

export function shortLabel(name: string, max = 36): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const dash = cleaned.indexOf(" — ");
  if (dash > 0 && dash <= max) return cleaned.slice(0, dash);
  return `${cleaned.slice(0, max - 1)}…`;
}
