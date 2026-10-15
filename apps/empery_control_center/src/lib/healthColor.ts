import type { HealthStatus } from "@/api/types";

/** Maps health status to Tailwind utility class names using Signal Obsidian tokens. */
export function healthColorClass(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "text-ok";
    case "degraded":
      return "text-degraded";
    case "down":
      return "text-down";
    case "unknown":
    default:
      return "text-unknown";
  }
}

export function healthBgClass(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "bg-ok";
    case "degraded":
      return "bg-degraded";
    case "down":
      return "bg-down";
    case "unknown":
    default:
      return "bg-unknown";
  }
}

/** CSS custom-property token for inline styles / React Flow. */
export function healthToken(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "var(--ecc-ok)";
    case "degraded":
      return "var(--ecc-degraded)";
    case "down":
      return "var(--ecc-down)";
    case "unknown":
    default:
      return "var(--ecc-unknown)";
  }
}

export function healthLabel(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    case "unknown":
    default:
      return "Unknown";
  }
}
