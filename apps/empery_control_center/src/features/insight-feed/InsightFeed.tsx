import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Radio, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { SkeletonPulse } from "../../components/SkeletonPulse";
import {
  ScrollRegion,
  type ScrollRegionHandle,
} from "../../components/ScrollRegion";
import { IconButton } from "../../components/IconButton";
import type { EccLiveEvent, FeedItemDTO } from "../../api/types";
import { useEccStore } from "@/state/store";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { feedLivePulse, reducedMotionVariants } from "../../theme/motion";
import { InsightItem } from "./InsightItem";
import { isAuditHookItem } from "./feedFilters";
import { correlateServices, useInsightFeed } from "./useInsightFeed";

export interface InsightFeedProps {
  liveEvents?: EccLiveEvent[];
  externalItems?: FeedItemDTO[];
  enablePolling?: boolean;
  newestAtBottom?: boolean;
  /** Show Cursor audit_hook events (default OFF). */
  includeAuditHooks?: boolean;
  onCorrelate?: (serviceNames: string[], item: FeedItemDTO) => void;
  className?: string;
}

export function InsightFeed({
  liveEvents,
  externalItems,
  enablePolling,
  newestAtBottom = true,
  includeAuditHooks,
  onCorrelate,
  className = "",
}: InsightFeedProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const connectionStatus = useEccStore((s) => s.connectionStatus);
  const liveConnected = connectionStatus === "connected";
  const feed = useInsightFeed({
    liveEvents,
    externalItems,
    enablePolling,
    newestAtBottom,
    includeAuditHooks,
  });
  const scrollRef = useRef<ScrollRegionHandle>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const prevLenRef = useRef(0);
  const prevAuditRef = useRef(feed.includeAuditHooks);

  // Pin only inside the feed scroller — never touch window/document scroll.
  useEffect(() => {
    if (!newestAtBottom) return;
    const len = feed.ordered.length;
    const grew = len > prevLenRef.current;
    const auditJustEnabled =
      feed.includeAuditHooks && !prevAuditRef.current;
    prevLenRef.current = len;
    prevAuditRef.current = feed.includeAuditHooks;

    if (!grew && !auditJustEnabled) return;
    // Bulk audit hydrate: stay put if the user was reading mid-list.
    if (auditJustEnabled && !stuckToBottom) return;
    if (!stuckToBottom && !scrollRef.current?.isNearBottom()) return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToBottom();
    });
  }, [
    feed.ordered.length,
    feed.includeAuditHooks,
    newestAtBottom,
    stuckToBottom,
  ]);

  const jumpToLatest = () => {
    setStuckToBottom(true);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToBottom();
    });
  };

  const quietMotion = feed.ordered.length > 12;

  return (
    <Panel
      title={t("feed.title")}
      flush
      accent={liveConnected}
      className={["relative h-full min-h-0", className].join(" ")}
      actions={
        <div className="flex items-center gap-1.5">
          {liveConnected ? (
            <motion.span
              className="mr-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-signal"
              title={t("feed.live")}
            >
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-sm bg-signal"
                variants={
                  reduced
                    ? reducedMotionVariants.feedLivePulse
                    : feedLivePulse
                }
                initial="idle"
                animate="live"
                aria-hidden
              />
              {t("feed.live")}
            </motion.span>
          ) : null}
          <label
            className="flex items-center gap-1 px-1 text-[10px] text-ink-muted"
            title={t("feed.showAuditHint")}
          >
            <input
              type="checkbox"
              checked={feed.includeAuditHooks}
              onChange={(e) => feed.setIncludeAuditHooks(e.target.checked)}
              className="accent-[var(--ecc-signal)]"
              aria-label={t("feed.showAudit")}
            />
            {t("feed.showAudit")}
          </label>
          <IconButton
            label={t("feed.refresh")}
            onClick={() => void feed.refresh()}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          </IconButton>
        </div>
      }
    >
      {feed.error ? (
        <div className="p-2">
          <ErrorBanner message={feed.error} />
        </div>
      ) : null}
      <ScrollRegion
        ref={scrollRef}
        onStickChange={setStuckToBottom}
        className="relative"
      >
        {feed.loading && feed.ordered.length === 0 ? (
          <div className="p-4">
            <SkeletonPulse rows={5} />
          </div>
        ) : feed.ordered.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-6 w-6" strokeWidth={1.5} />}
            title={t("feed.empty")}
            description={t("feed.emptyHint")}
          />
        ) : (
          <AnimatePresence initial={false}>
            {feed.ordered.map((item) => (
              <InsightItem
                key={item.id}
                item={item}
                active={feed.selectedId === item.id}
                quietMotion={quietMotion || isAuditHookItem(item)}
                onSelect={(it) => {
                  feed.setSelectedId(it.id);
                  onCorrelate?.(correlateServices(it), it);
                }}
              />
            ))}
          </AnimatePresence>
        )}
      </ScrollRegion>
      {newestAtBottom && !stuckToBottom && feed.ordered.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-line bg-panel-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink shadow-sm hover:bg-signal-soft"
          >
            <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
            {t("feed.jumpToLatest")}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
