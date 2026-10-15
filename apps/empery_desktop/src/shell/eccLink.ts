/** ECC (ops) base URL for desktop deep-links. */

export function eccBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ECC_UI_BASE?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5173`;
  }
  return "http://127.0.0.1:5173";
}

export function eccPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${eccBaseUrl()}${p}`;
}
