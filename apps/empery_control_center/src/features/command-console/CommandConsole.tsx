import { useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { IconButton } from "../../components/IconButton";
import { EmptyState } from "../../components/EmptyState";
import {
  ScrollRegion,
  type ScrollRegionHandle,
} from "../../components/ScrollRegion";
import type { ConsoleLineDTO, EccLiveEvent } from "../../api/types";
import { ConsoleLine } from "./ConsoleLine";
import { useConsoleStream } from "./useConsoleStream";

export interface CommandConsoleProps {
  externalLines?: ConsoleLineDTO[];
  liveEvents?: EccLiveEvent[];
  enableAuditPolling?: boolean;
  className?: string;
}

export function CommandConsole({
  externalLines,
  liveEvents,
  enableAuditPolling,
  className = "",
}: CommandConsoleProps) {
  const { t } = useTranslation();
  const stream = useConsoleStream({
    externalLines,
    liveEvents,
    enableAuditPolling,
  });
  const scrollRef = useRef<ScrollRegionHandle>(null);

  useEffect(() => {
    if (stream.stickToBottom) {
      scrollRef.current?.scrollToBottom();
    }
  }, [stream.filtered, stream.stickToBottom]);

  return (
    <Panel
      title={t("console.title")}
      className={["h-full min-h-[180px]", className].join(" ")}
      flush
      actions={
        <>
          <select
            aria-label={t("console.filterLevel")}
            value={stream.filterLevel}
            onChange={(e) =>
              stream.setFilterLevel(
                e.target.value as typeof stream.filterLevel,
              )
            }
            className="rounded-sm border border-line bg-console-bg px-1.5 py-0.5 font-mono text-[11px] text-console-fg"
          >
            <option value="all">all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="thought">thought</option>
          </select>
          <input
            aria-label={t("console.filterSource")}
            placeholder={t("console.filterSource")}
            value={stream.filterSource}
            onChange={(e) => stream.setFilterSource(e.target.value)}
            className="w-24 rounded-sm border border-line bg-console-bg px-1.5 py-0.5 font-mono text-[11px] text-console-fg placeholder:text-console-dim"
          />
          <label className="flex items-center gap-1 px-1 text-[10px] text-ink-muted">
            <input
              type="checkbox"
              checked={stream.stickToBottom}
              onChange={(e) => stream.setStickToBottom(e.target.checked)}
              className="accent-[var(--ecc-signal)]"
            />
            {t("console.stick")}
          </label>
          <IconButton label={t("console.clear")} onClick={stream.clear}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </IconButton>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-console-bg">
        <ScrollRegion
          ref={scrollRef}
          className="py-1"
          onStickChange={(stuck) => {
            if (!stuck && stream.stickToBottom) stream.setStickToBottom(false);
            if (stuck && !stream.stickToBottom) stream.setStickToBottom(true);
          }}
        >
          {stream.filtered.length === 0 ? (
            <EmptyState
              icon={<Terminal className="h-6 w-6" strokeWidth={1.5} />}
              title={t("console.empty")}
              description={t("console.emptyHint")}
            />
          ) : (
            stream.filtered.map((line) => (
              <ConsoleLine key={line.id} line={line} />
            ))
          )}
        </ScrollRegion>
      </div>
    </Panel>
  );
}
