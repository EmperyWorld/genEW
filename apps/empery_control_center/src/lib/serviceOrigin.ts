/**
 * Map/provenance: platform seed vs Hands-generated capsules.
 * Mirrors EIC SEED_PRODUCT_SERVICES + SPINE — display only, not an allowlist gate.
 */

export type ServiceOrigin = "platform" | "hands";

/** Spine + seed product services (compose baseline / Trinity / studios). */
export const PLATFORM_SERVICE_NAMES = new Set([
  "postgres",
  "redis",
  "empery_intelligence_core",
  "empery_control_center",
  "empery_control_center_api",
  "empery_deploy_agent",
  "identity_service",
  "core_auth_service",
  "desktop_shell",
  "ai_chat",
  "dedmoroz",
  "image_studio",
  "video_studio",
  "music_forge",
  "site_studio",
  "analytics_service",
  "task_orchestrator_service",
  "intelligence_service",
]);

export function classifyServiceOrigin(
  name: string,
  features: string[] = [],
): ServiceOrigin {
  if (PLATFORM_SERVICE_NAMES.has(name)) return "platform";
  if (features.includes("user_created")) return "hands";
  // Non-platform registry entries are Hands / lab capsules by default.
  return "hands";
}
