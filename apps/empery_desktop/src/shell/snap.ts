/**
 * Window edge snap — adapted from EliteEW useWindowSnap / desktopSnapGeometry
 * (reference/eliteew/packs/window_snap/). Empery-owned runtime; no EliteEW imports.
 */

import type { CSSProperties } from "react";

export type SnapZone =
  | "left"
  | "right"
  | "maximize"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | null;

export type SnapRect = {
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMaximized: boolean;
};

const EDGE = 24;
const CORNER = 56;
const TASKBAR = 56;
const PAD = 8;

export function workAreaSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return {
    width: window.innerWidth,
    height: Math.max(240, window.innerHeight - TASKBAR),
  };
}

export function detectSnapZone(clientX: number, clientY: number): SnapZone {
  const { width, height } = workAreaSize();
  const nearLeft = clientX <= EDGE;
  const nearRight = clientX >= width - EDGE;
  const nearTop = clientY <= EDGE;
  const nearBottom = clientY >= height - EDGE;

  const inLeft = clientX <= CORNER;
  const inRight = clientX >= width - CORNER;
  const inTop = clientY <= CORNER;
  const inBottom = clientY >= height - CORNER;

  if (inLeft && inTop) return "top-left";
  if (inRight && inTop) return "top-right";
  if (inLeft && inBottom) return "bottom-left";
  if (inRight && inBottom) return "bottom-right";
  if (nearTop) return "maximize";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  if (nearBottom) return null;
  return null;
}

export function rectForSnapZone(zone: Exclude<SnapZone, null>): SnapRect {
  const { width, height } = workAreaSize();
  const halfW = width / 2;
  const halfH = height / 2;

  switch (zone) {
    case "left":
      return {
        position: { x: PAD, y: PAD },
        size: { width: halfW - PAD * 1.5, height: height - PAD * 2 },
        isMaximized: false,
      };
    case "right":
      return {
        position: { x: halfW + PAD / 2, y: PAD },
        size: { width: halfW - PAD * 1.5, height: height - PAD * 2 },
        isMaximized: false,
      };
    case "maximize":
      return {
        position: { x: PAD, y: PAD },
        size: { width: width - PAD * 2, height: height - PAD * 2 },
        isMaximized: true,
      };
    case "top-left":
      return {
        position: { x: PAD, y: PAD },
        size: { width: halfW - PAD * 1.5, height: halfH - PAD * 1.5 },
        isMaximized: false,
      };
    case "top-right":
      return {
        position: { x: halfW + PAD / 2, y: PAD },
        size: { width: halfW - PAD * 1.5, height: halfH - PAD * 1.5 },
        isMaximized: false,
      };
    case "bottom-left":
      return {
        position: { x: PAD, y: halfH + PAD / 2 },
        size: { width: halfW - PAD * 1.5, height: halfH - PAD * 1.5 },
        isMaximized: false,
      };
    case "bottom-right":
      return {
        position: { x: halfW + PAD / 2, y: halfH + PAD / 2 },
        size: { width: halfW - PAD * 1.5, height: halfH - PAD * 1.5 },
        isMaximized: false,
      };
  }
}

/** CSS placement for preview overlay (percent of work area above taskbar). */
export function snapPreviewStyle(zone: Exclude<SnapZone, null>): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    boxSizing: "border-box",
  };
  switch (zone) {
    case "left":
      return { ...base, left: 0, top: 0, width: "50%", height: "100%" };
    case "right":
      return { ...base, right: 0, top: 0, width: "50%", height: "100%" };
    case "maximize":
      return { ...base, left: 0, top: 0, width: "100%", height: "100%" };
    case "top-left":
      return { ...base, left: 0, top: 0, width: "50%", height: "50%" };
    case "top-right":
      return { ...base, right: 0, top: 0, width: "50%", height: "50%" };
    case "bottom-left":
      return { ...base, left: 0, bottom: 0, width: "50%", height: "50%" };
    case "bottom-right":
      return { ...base, right: 0, bottom: 0, width: "50%", height: "50%" };
  }
}
