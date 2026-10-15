import { Focus, RefreshCw, Filter, Activity, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";

export interface MapToolbarProps {
  onFitView: () => void;
  onRefresh: () => void;
  onResetLayout?: () => void;
  refreshing?: boolean;
  showUnhealthyOnly: boolean;
  onToggleUnhealthy: () => void;
  serviceCount: number;
  generatedAt?: string;
}

export function MapToolbar({
  onFitView,
  onRefresh,
  onResetLayout,
  refreshing,
  showUnhealthyOnly,
  onToggleUnhealthy,
  serviceCount,
  generatedAt,
}: MapToolbarProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel/95 px-2 py-1.5 backdrop-blur-sm">
      <IconButton label={t("map.fit")} onClick={onFitView}>
        <Focus className="h-4 w-4 text-metal" strokeWidth={1.5} />
      </IconButton>
      <IconButton
        label={t("map.refresh")}
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw
          className={["h-4 w-4 text-signal", refreshing ? "animate-spin" : ""].join(
            " ",
          )}
          strokeWidth={1.5}
        />
      </IconButton>
      {onResetLayout ? (
        <IconButton label={t("map.resetLayout")} onClick={onResetLayout}>
          <LayoutGrid className="h-4 w-4 text-metal" strokeWidth={1.5} />
        </IconButton>
      ) : null}
      <Button
        variant={showUnhealthyOnly ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggleUnhealthy}
      >
        <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
        {showUnhealthyOnly ? t("map.unhealthyOnly") : t("map.allServices")}
      </Button>
      <div className="mx-1 h-4 w-px bg-line" />
      <span className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] text-ink-muted">
        <Activity className="h-3 w-3 text-signal" strokeWidth={1.5} />
        {t("map.servicesCount", { count: serviceCount })}
        {generatedAt ? (
          <span className="text-ink-faint">
            ·{" "}
            {new Date(generatedAt).toLocaleTimeString(
              i18n.language === "en" ? "en-US" : "ru-RU",
            )}
          </span>
        ) : null}
      </span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1 text-[10px] text-ink-faint">
        <LegendDot color="var(--ecc-ok)" label={t("map.legend.ok")} />
        <LegendDot color="var(--ecc-degraded)" label={t("map.legend.degraded")} />
        <LegendDot color="var(--ecc-down)" label={t("map.legend.down")} />
        <LegendDot color="var(--ecc-unknown)" label={t("map.legend.unknown")} />
        <span className="hidden h-3 w-px bg-line sm:inline-block" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm border border-line bg-panel-raised" />
          {t("map.legend.platform")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm border border-dashed border-metal/70 bg-panel" />
          {t("map.legend.hands")}
        </span>
        <span className="hidden h-3 w-px bg-line sm:inline-block" />
        <LegendLine
          color="var(--ecc-line-strong)"
          dashed={false}
          label={t("map.legend.hardDep")}
        />
        <LegendLine
          color="var(--ecc-metal)"
          dashed
          label={t("map.legend.eventFlow")}
        />
        <LegendLine
          color="var(--ecc-busy)"
          dashed
          label={t("map.legend.activity")}
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-1.5 w-1.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function LegendLine({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-3.5"
        style={{
          borderTop: `1.5px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
        aria-hidden
      />
      {label}
    </span>
  );
}
