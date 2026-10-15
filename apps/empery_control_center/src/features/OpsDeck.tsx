import { useState } from "react";
import type { EccLiveEvent, FeedItemDTO } from "../api/types";
import { EcosystemMapPage } from "./ecosystem-map";
import { CommandConsole } from "./command-console";
import { InsightFeed } from "./insight-feed";

export type OpsFocus = "balanced" | "map" | "console" | "feed";

export interface OpsDeckProps {
  focus?: OpsFocus;
  liveEvents?: EccLiveEvent[];
  className?: string;
}

/**
 * Ops home composition for CommandLayout:
 * Map (dominant) + Console + Insight Feed instrument strips.
 */
export function OpsDeck({
  focus = "balanced",
  liveEvents,
  className = "",
}: OpsDeckProps) {
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  const onCorrelate = (serviceNames: string[], _item: FeedItemDTO) => {
    setHighlightIds(serviceNames);
  };

  const mapClass =
    focus === "map"
      ? "min-h-0 flex-[3]"
      : focus === "balanced"
        ? "min-h-0 flex-[2]"
        : "min-h-0 flex-1";

  const stripClass =
    focus === "console" || focus === "feed"
      ? "min-h-0 flex-[2]"
      : "min-h-[200px] lg:min-h-0 lg:h-[240px]";

  return (
    <div
      className={[
        "flex h-full min-h-0 flex-col gap-2",
        className,
      ].join(" ")}
    >
      {(focus === "balanced" || focus === "map") && (
        <div className={mapClass}>
          <EcosystemMapPage
            liveEvents={liveEvents}
            highlightIds={highlightIds}
            className="h-full"
          />
        </div>
      )}

      <div
        className={[
          "grid gap-2 overflow-hidden",
          focus === "console"
            ? "min-h-0 flex-1 grid-cols-1"
            : focus === "feed"
              ? "min-h-0 flex-1 grid-cols-1"
              : "grid-cols-1 lg:grid-cols-2",
          stripClass,
        ].join(" ")}
      >
        {(focus === "balanced" || focus === "console" || focus === "map") && (
          <CommandConsole liveEvents={liveEvents} className="h-full" />
        )}
        {(focus === "balanced" || focus === "feed" || focus === "map") && (
          <InsightFeed
            liveEvents={liveEvents}
            onCorrelate={onCorrelate}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
