/**
 * Display-only Trinity / known-service role keys for i18n (`roles.*`).
 * NOT a service allowlist — Map nodes come solely from registry snapshots.
 */
const ROLE_KEYS = new Set([
  "identity_service",
  "task_orchestrator_service",
  "intelligence_service",
  "core_auth_service",
  "analytics_service",
  "empery_control_center_api",
  "empery_intelligence_core",
]);

/** Returns i18n key path `roles.{name}` when known; undefined otherwise. */
export function roleLabelKeyFor(serviceName: string): string | undefined {
  return ROLE_KEYS.has(serviceName) ? `roles.${serviceName}` : undefined;
}

/** @deprecated Prefer roleLabelKeyFor + t(); kept for graph DTO wiring. */
export function roleLabelFor(serviceName: string): string | undefined {
  return roleLabelKeyFor(serviceName);
}
