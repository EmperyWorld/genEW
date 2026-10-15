/** Token → JS helpers for Signal Obsidian (maps to CSS variables). */

export const emperyTheme = {
  name: "Signal Obsidian",
  colors: {
    void: "var(--ecc-void)",
    field: "var(--ecc-field)",
    panel: "var(--ecc-panel)",
    panelRaised: "var(--ecc-panel-raised)",
    line: "var(--ecc-line)",
    lineStrong: "var(--ecc-line-strong)",
    signal: "var(--ecc-signal)",
    signalDim: "var(--ecc-signal-dim)",
    signalSoft: "var(--ecc-signal-soft)",
    metal: "var(--ecc-metal)",
    metalDim: "var(--ecc-metal-dim)",
    ink: "var(--ecc-ink)",
    inkMuted: "var(--ecc-ink-muted)",
    inkFaint: "var(--ecc-ink-faint)",
    ok: "var(--ecc-ok)",
    degraded: "var(--ecc-degraded)",
    down: "var(--ecc-down)",
    unknown: "var(--ecc-unknown)",
    busy: "var(--ecc-busy)",
  },
  fonts: {
    display: "Sora, sans-serif",
    body: "Manrope, sans-serif",
    mono: '"IBM Plex Mono", monospace',
  },
  radii: {
    sm: "var(--ecc-radius-sm)",
    md: "var(--ecc-radius-md)",
    lg: "var(--ecc-radius-lg)",
  },
} as const;

export type HealthToken = "ok" | "degraded" | "down" | "unknown" | "busy";

export function healthColor(status: HealthToken): string {
  switch (status) {
    case "ok":
      return emperyTheme.colors.ok;
    case "degraded":
      return emperyTheme.colors.degraded;
    case "down":
      return emperyTheme.colors.down;
    case "busy":
      return emperyTheme.colors.busy;
    case "unknown":
    default:
      return emperyTheme.colors.unknown;
  }
}
