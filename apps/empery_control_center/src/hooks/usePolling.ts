import { useEffect, useRef } from "react";

/**
 * REST polling fallback when WS (Implementer 4) is unavailable.
 */
export function usePolling(
  enabled: boolean,
  intervalMs: number,
  tick: () => void | Promise<void>,
): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        await tickRef.current();
      } catch {
        /* callers surface errors via their own state */
      }
    };

    void run();
    const id = window.setInterval(() => void run(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
