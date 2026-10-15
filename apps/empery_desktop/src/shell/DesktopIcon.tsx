import { useTranslation } from "react-i18next";
import { displayAppTitle } from "@/i18n/displayAppTitle";
import { cn } from "@/lib/cn";
import { DesktopAppSymbol } from "./icons";
import type { DesktopItem } from "./types";

type Props = {
  item: DesktopItem;
  selected: boolean;
  iconUrl?: string | null;
  onSelect: () => void;
  onOpen: () => void;
};

export function DesktopIcon({
  item,
  selected,
  iconUrl,
  onSelect,
  onOpen,
}: Props) {
  const { i18n } = useTranslation();
  const label = displayAppTitle(item.app_component, item.name);
  // re-render when language changes
  void i18n.language;

  return (
    <button
      type="button"
      data-desktop-icon-id={item.id}
      title={label}
      className={cn(
        "absolute z-10 flex w-[5.75rem] flex-col items-center gap-1.5 rounded-xl p-2 text-center text-ink transition",
        "hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal/50",
        selected && "bg-signal/12 ring-1 ring-signal/35",
      )}
      style={{ left: item.position.x, top: item.position.y }}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <DesktopAppSymbol
        item={item}
        size="lg"
        iconUrl={iconUrl}
        className={selected ? "ring-1 ring-signal/40" : undefined}
      />
      <span className="line-clamp-2 max-w-full text-[11px] leading-tight text-ink drop-shadow-[0_1px_2px_rgb(0_0_0/0.85)]">
        {label}
      </span>
    </button>
  );
}
