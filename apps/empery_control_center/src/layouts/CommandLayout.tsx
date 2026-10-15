import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EcosystemMapPage } from "@/features/ecosystem-map/EcosystemMapPage";
import { CommandConsole } from "@/features/command-console/CommandConsole";
import {
  InsightFeed,
  correlateServices,
} from "@/features/insight-feed";
import { useEccStore } from "@/state/store";
import type { OpsFocusPanel } from "@/state/slices/uiSlice";
import type { FeedItemDTO } from "@/api/types";
import { FabricSummaryStrip } from "@/features/ops/FabricSummaryStrip";
import { OnboardingChecklist } from "@/features/onboarding/OnboardingChecklist";
import { PATHS } from "@/routes/paths";

/** Recent feed topics → activity edge pairs for map traffic dashes. */
function trafficPairsFromFeed(
  items: FeedItemDTO[],
): Array<{ source: string; target: string }> {
  const pairs: Array<{ source: string; target: string }> = [];
  const seen = new Set<string>();
  for (const item of items.slice(-40)) {
    const names = correlateServices(item);
    if (names.length < 2) continue;
    // Publisher → consumer: last name is typically the source domain.
    for (let i = names.length - 1; i > 0; i -= 1) {
      const source = names[i]!;
      const target = names[i - 1]!;
      const id = `${source}->${target}`;
      if (seen.has(id)) continue;
      seen.add(id);
      pairs.push({ source, target });
    }
  }
  return pairs;
}

function focusFromPath(pathname: string): OpsFocusPanel {
  if (pathname.startsWith(PATHS.opsMap)) return "map";
  if (pathname.startsWith(PATHS.opsConsole)) return "console";
  if (pathname.startsWith(PATHS.opsFeed)) return "feed";
  return "balanced";
}

/**
 * Ops home composition: Map as dominant plane; Console + Intelligence Feed as docked strips.
 */
export function CommandLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const opsFocus = useEccStore((s) => s.opsFocus);
  const setOpsFocus = useEccStore((s) => s.setOpsFocus);
  const consoleCollapsed = useEccStore((s) => s.consoleCollapsed);
  const feedCollapsed = useEccStore((s) => s.feedCollapsed);
  const connectionStatus = useEccStore((s) => s.connectionStatus);
  const storeConsoleLines = useEccStore((s) => s.lines);
  const storeFeedItems = useEccStore((s) => s.items);
  const selectService = useEccStore((s) => s.selectService);
  const setCorrelationId = useEccStore((s) => s.setCorrelationId);

  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  useEffect(() => {
    setOpsFocus(focusFromPath(location.pathname));
  }, [location.pathname, setOpsFocus]);

  const liveConnected = connectionStatus === "connected";
  // Console/feed can rely on SocketBridge when Live. The map still needs an initial
  // REST registry snapshot (WS registry frames are sparse); useEcosystemGraph always
  // loads once on mount, and REST-polls only while the socket is down.
  const enablePolling = !liveConnected;

  const mapWeight =
    opsFocus === "map" ? "flex-[3]" : opsFocus === "balanced" ? "flex-[2]" : "flex-1";
  const consoleWeight =
    opsFocus === "console" ? "flex-[2]" : consoleCollapsed ? "hidden" : "flex-1";
  const feedWeight =
    opsFocus === "feed" ? "flex-[2]" : feedCollapsed ? "hidden" : "flex-1";

  const onCorrelate = useMemo(
    () => (serviceNames: string[], item: FeedItemDTO) => {
      setHighlightIds(serviceNames);
      setCorrelationId(item.correlation_id ?? null);
    },
    [setCorrelationId],
  );

  const trafficPairs = useMemo(
    () => trafficPairsFromFeed(storeFeedItems),
    [storeFeedItems],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FabricSummaryStrip />
      <OnboardingChecklist />
      <div className="flex min-h-0 flex-1 flex-col gap-px bg-line md:flex-row">
      <section
        className={`ecc-stage relative flex min-h-[40vh] flex-col bg-field md:min-h-0 ${mapWeight}`}
        aria-label={t("map.aria")}
      >
        <EcosystemMapPage
          enablePolling={enablePolling}
          highlightIds={highlightIds}
          trafficPairs={trafficPairs}
          onSelectService={(id) => selectService(id)}
          className="h-full"
        />
        <div className="sr-only">
          <Outlet />
        </div>
      </section>

      <aside className="flex min-h-[36vh] min-w-0 flex-col gap-px bg-line md:min-h-0 md:w-[min(420px,38%)] md:flex-none">
        <section
          className={`ecc-stage flex min-h-0 flex-col bg-console-bg ${consoleWeight}`}
          aria-label={t("console.aria")}
        >
          <CommandConsole
            externalLines={storeConsoleLines}
            enableAuditPolling={enablePolling}
            className="h-full"
          />
        </section>
        <section
          className={`ecc-stage flex min-h-0 flex-col bg-panel ${feedWeight}`}
          aria-label={t("feed.aria")}
        >
          <InsightFeed
            externalItems={storeFeedItems}
            enablePolling={enablePolling}
            onCorrelate={onCorrelate}
            className="h-full"
          />
        </section>
      </aside>
      </div>
    </div>
  );
}
