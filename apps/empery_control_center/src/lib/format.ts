import i18n from "@/i18n";

export function humanizeServiceName(name: string): string {
  return name
    .replace(/_service$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return i18n.t("common.dash");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = i18n.language?.split("-")[0] || "ru";
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
