/** Resolve peer HTTP base for LAN vs loopback desktop pages. */

export function peerApiBase(
  port: number,
  envOverride?: string | undefined,
): string {
  const fromEnv = envOverride?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:${port}`;
    }
  }
  return `http://127.0.0.1:${port}`;
}
