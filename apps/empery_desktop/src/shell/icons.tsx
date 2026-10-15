import {
  AppWindow,
  Bot,
  Clapperboard,
  FileText,
  Folder,
  Globe,
  ImageIcon,
  LayoutGrid,
  MessageCircle,
  Music2,
  PanelsTopLeft,
  Snowflake,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { DesktopItem } from "./types";

type SymbolSpec = {
  Icon: LucideIcon;
  /** Tailwind text class for glyph */
  tint: string;
  /** Tile background tint */
  tile: string;
};

const BY_COMPONENT: Record<string, SymbolSpec> = {
  control_center: {
    Icon: LayoutGrid,
    tint: "text-sky-300",
    tile: "bg-sky-500/15 border-sky-400/30",
  },
  autonomous: {
    Icon: Bot,
    tint: "text-signal",
    tile: "bg-signal/15 border-signal/35",
  },
  doc_editor: {
    Icon: FileText,
    tint: "text-amber-200",
    tile: "bg-amber-500/15 border-amber-400/30",
  },
  image_studio: {
    Icon: ImageIcon,
    tint: "text-fuchsia-300",
    tile: "bg-fuchsia-500/15 border-fuchsia-400/30",
  },
  video_studio: {
    Icon: Clapperboard,
    tint: "text-violet-300",
    tile: "bg-violet-500/15 border-violet-400/30",
  },
  music_forge: {
    Icon: Music2,
    tint: "text-rose-300",
    tile: "bg-rose-500/15 border-rose-400/30",
  },
  ewa_companion: {
    Icon: MessageCircle,
    tint: "text-emerald-300",
    tile: "bg-emerald-500/15 border-emerald-400/30",
  },
  site_studio: {
    Icon: Globe,
    tint: "text-cyan-300",
    tile: "bg-cyan-500/15 border-cyan-400/30",
  },
  workspace: {
    Icon: PanelsTopLeft,
    tint: "text-ink",
    tile: "bg-white/10 border-white/20",
  },
  ai_chat: {
    Icon: MessageCircle,
    tint: "text-teal-300",
    tile: "bg-teal-500/15 border-teal-400/30",
  },
  dedmoroz: {
    Icon: Snowflake,
    tint: "text-sky-200",
    tile: "bg-sky-400/15 border-sky-300/35",
  },
  p3_comp_live: {
    Icon: MessageCircle,
    tint: "text-lime-300",
    tile: "bg-lime-500/15 border-lime-400/30",
  },
  p3_companion_x: {
    Icon: MessageCircle,
    tint: "text-orange-300",
    tile: "bg-orange-500/15 border-orange-400/30",
  },
};

function resolveSpec(
  item: Pick<DesktopItem, "type" | "app_component">,
): SymbolSpec {
  if (item.type === "folder") {
    return {
      Icon: Folder,
      tint: "text-amber-200",
      tile: "bg-amber-500/12 border-amber-400/25",
    };
  }
  const key = (item.app_component || "").trim();
  return (
    BY_COMPONENT[key] ?? {
      Icon: AppWindow,
      tint: "text-signal",
      tile: "bg-signal/12 border-signal/30",
    }
  );
}

/** Lucide icon component for legacy call sites. */
export function iconForItem(
  item: Pick<DesktopItem, "type" | "app_component">,
): LucideIcon {
  return resolveSpec(item).Icon;
}

type DesktopAppSymbolProps = {
  item: Pick<DesktopItem, "type" | "app_component">;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional remote/catalog icon URL */
  iconUrl?: string | null;
};

const SIZE = {
  sm: { box: "h-8 w-8 rounded-lg", glyph: 16 },
  md: { box: "h-10 w-10 rounded-xl", glyph: 18 },
  lg: { box: "h-12 w-12 rounded-2xl", glyph: 22 },
} as const;

export function DesktopAppSymbol({
  item,
  size = "md",
  className,
  iconUrl,
}: DesktopAppSymbolProps) {
  const spec = resolveSpec(item);
  const dim = SIZE[size];
  if (iconUrl && /^(\/|https?:)/.test(iconUrl)) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border",
          dim.box,
          "border-white/15 bg-black/30",
          className,
        )}
      >
        <img src={iconUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  const Icon = spec.Icon;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]",
        dim.box,
        spec.tile,
        className,
      )}
    >
      <Icon size={dim.glyph} strokeWidth={1.5} className={spec.tint} />
    </span>
  );
}
