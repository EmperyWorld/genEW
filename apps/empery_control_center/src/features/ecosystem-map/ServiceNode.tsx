import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { humanizeServiceName } from "../../lib/format";
import { healthToken } from "../../lib/healthColor";
import { classifyServiceOrigin } from "../../lib/serviceOrigin";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { mapNodeEnter, reducedMotionVariants } from "../../theme/motion";
import { cn } from "@/lib/cn";
import type { ServiceNodeData } from "./layoutGraph";

export function ServiceNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const { service, highlighted } = data as ServiceNodeData;
  const reduced = useReducedMotion();
  const health = service.health;
  const color = healthToken(health);
  const pulse = health === "ok" && !reduced;
  const roleText = service.role_label
    ? t(service.role_label, { defaultValue: "" }) || undefined
    : undefined;
  const healthText = t(`health.${health}`);
  const elevated = selected || highlighted;
  const depCount = service.manifest.dependencies.length;
  const origin =
    service.origin ??
    classifyServiceOrigin(service.manifest.name, service.manifest.features);
  const isHands = origin === "hands";
  const originText = t(isHands ? "map.origin.hands" : "map.origin.platform");

  return (
    <motion.div
      variants={reduced ? reducedMotionVariants.mapNodeEnter : mapNodeEnter}
      initial="hidden"
      animate="visible"
      className={cn(
        "relative min-w-[190px] max-w-[240px] cursor-grab px-3 py-2.5 shadow-none active:cursor-grabbing",
        isHands
          ? "rounded-sm border border-dashed bg-panel"
          : "rounded-md border bg-panel-raised",
        elevated
          ? "border-signal bg-signal-soft/40"
          : isHands
            ? "border-metal/70"
            : "border-line",
        health === "down" && !elevated && "border-down/50",
        health === "degraded" && !elevated && "border-degraded/40",
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: color,
        ...(pulse
          ? { animation: "ecc-node-breath 2.8s ease-in-out infinite" }
          : {}),
      }}
    >
      {elevated ? (
        <>
          <span
            className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-metal"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-metal"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-metal"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-metal"
            aria-hidden
          />
        </>
      ) : null}

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-line-strong"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[13px] font-semibold text-ink">
            {humanizeServiceName(service.manifest.name)}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[9px] uppercase tracking-wider",
              isHands ? "text-metal" : "text-signal-dim",
            )}
          >
            {originText}
            {roleText ? ` · ${roleText}` : ""}
          </p>
        </div>
        <span
          className="mt-0.5 shrink-0 rounded-sm border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide"
          style={{
            color,
            borderColor: color,
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
          title={healthText}
          aria-label={healthText}
        >
          {healthText}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-ink-faint">
        v{service.manifest.version}
        {depCount > 0 ? (
          <span className="text-ink-muted">
            {" "}
            · {t("map.depsShort", { count: depCount })}
          </span>
        ) : null}
      </p>
      {service.manifest.features.length > 0 ? (
        <p className="mt-1 truncate text-[10px] text-ink-muted">
          {service.manifest.features.slice(0, 3).join(" · ")}
          {service.manifest.features.length > 3
            ? ` +${service.manifest.features.length - 3}`
            : ""}
        </p>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-signal-dim"
      />
      <style>{`
        @keyframes ecc-node-breath {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.88; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ecc-node-breath {
            0%, 100% { opacity: 1; }
          }
        }
      `}</style>
    </motion.div>
  );
}
