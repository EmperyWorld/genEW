/**
 * Thin re-export so feature clients can import from `@/config/env`
 * while shell owns canonical `@/config`.
 */
import { config, apiUrl } from "@/config";

export function getEccApiBase(): string {
  return config.apiBase.replace(/\/$/, "");
}

export function getEccApiV1(): string {
  return `${getEccApiBase()}${config.apiPrefix}`;
}

export { config, apiUrl };
