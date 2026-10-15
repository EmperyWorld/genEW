import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const traffic = Boolean(
    data && typeof data === "object" && "traffic" in data && data.traffic,
  );
  const dimmed = Boolean(
    data && typeof data === "object" && "dimmed" in data && data.dimmed,
  );
  const kind =
    data && typeof data === "object" && "kind" in data
      ? String(data.kind)
      : "dependency";
  const activity = kind === "activity";
  const eventFlow = kind === "event";

  const stroke = selected
    ? "var(--ecc-signal)"
    : traffic || activity
      ? "var(--ecc-busy)"
      : eventFlow
        ? "var(--ecc-metal)"
        : "var(--ecc-line-strong)";

  const dashed = traffic || activity || eventFlow;

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke,
        strokeWidth: selected || traffic ? 2.25 : activity || eventFlow ? 1.75 : 1.35,
        strokeDasharray: dashed
          ? eventFlow && !traffic && !activity
            ? "4 5"
            : "6 4"
          : undefined,
        animation:
          traffic || activity
            ? "ecc-edge-dash 0.8s linear infinite"
            : undefined,
        opacity: dimmed ? 0.22 : 1,
        transition: "opacity 160ms ease, stroke 160ms ease",
      }}
    />
  );
}

/** Inject once at map root if needed — kept as CSS string for Vite apps. */
export const CONNECTION_EDGE_KEYFRAMES = `
@keyframes ecc-edge-dash {
  to { stroke-dashoffset: -20; }
}
`;
