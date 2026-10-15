import { useCallback, useMemo, useRef, useState } from "react";
import { rectForSnapZone, type SnapZone } from "./snap";
import type { DesktopItem, WindowState } from "./types";

const DEFAULT_SIZE = { width: 720, height: 480 };
const CASCADE = 28;

function createWindowId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `w-${globalThis.crypto.randomUUID()}`;
  }
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function workArea() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720, bottomPad: 56 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    bottomPad: 56,
  };
}

function maximizedBounds() {
  const area = workArea();
  return {
    position: { x: 16, y: 16 },
    size: {
      width: Math.max(320, area.width - 32),
      height: Math.max(240, area.height - area.bottomPad - 32),
    },
  };
}

export function useWindowManager() {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const maxZRef = useRef(10);

  const bumpZ = useCallback(() => {
    maxZRef.current += 1;
    return maxZRef.current;
  }, []);

  const visibleWindows = useMemo(
    () => windows.filter((w) => !w.isMinimized),
    [windows],
  );

  const focusWindow = useCallback(
    (id: string) => {
      const z = bumpZ();
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, zIndex: z, isMinimized: false } : w,
        ),
      );
    },
    [bumpZ],
  );

  const openWindow = useCallback(
    (item: DesktopItem) => {
      if (item.type !== "app" && item.type !== "folder") return;

      setWindows((prev) => {
        const existing = prev.find((w) => w.itemId === item.id);
        if (existing) {
          const z = bumpZ();
          return prev.map((w) =>
            w.id === existing.id
              ? { ...w, zIndex: z, isMinimized: false }
              : w,
          );
        }

        const openCount = prev.length;
        const area = workArea();
        const z = bumpZ();
        const win: WindowState = {
          id: createWindowId(),
          title: item.name,
          type: item.type === "folder" ? "folder" : "app",
          position: {
            x: Math.min(
              80 + openCount * CASCADE,
              Math.max(24, area.width - DEFAULT_SIZE.width - 24),
            ),
            y: Math.min(
              64 + openCount * CASCADE,
              Math.max(24, area.height - DEFAULT_SIZE.height - 80),
            ),
          },
          size: { ...DEFAULT_SIZE },
          restoreBounds: null,
          isMinimized: false,
          isMaximized: false,
          zIndex: z,
          appComponent: item.app_component ?? undefined,
          itemId: item.id,
        };
        return [...prev, win];
      });
    },
    [bumpZ],
  );

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)),
    );
  }, []);

  const maximizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (w.isMaximized) {
          const restore = w.restoreBounds;
          return {
            ...w,
            isMaximized: false,
            isMinimized: false,
            position: restore?.position ?? w.position,
            size: restore?.size ?? w.size,
            restoreBounds: null,
          };
        }
        const bounds = maximizedBounds();
        return {
          ...w,
          isMaximized: true,
          isMinimized: false,
          restoreBounds: { position: w.position, size: w.size },
          position: bounds.position,
          size: bounds.size,
        };
      }),
    );
  }, []);

  const moveWindow = useCallback((id: string, position: { x: number; y: number }) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id && !w.isMaximized ? { ...w, position } : w,
      ),
    );
  }, []);

  const resizeWindow = useCallback(
    (id: string, size: { width: number; height: number }) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id && !w.isMaximized
            ? {
                ...w,
                size: {
                  width: Math.max(360, size.width),
                  height: Math.max(240, size.height),
                },
              }
            : w,
        ),
      );
    },
    [],
  );

  const snapWindow = useCallback((id: string, zone: Exclude<SnapZone, null>) => {
    const rect = rectForSnapZone(zone);
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        return {
          ...w,
          isMinimized: false,
          isMaximized: rect.isMaximized,
          restoreBounds: w.isMaximized
            ? w.restoreBounds
            : { position: w.position, size: w.size },
          position: rect.position,
          size: rect.size,
        };
      }),
    );
  }, []);

  return {
    windows,
    visibleWindows,
    openWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    snapWindow,
  };
}

export type WindowManager = ReturnType<typeof useWindowManager>;
