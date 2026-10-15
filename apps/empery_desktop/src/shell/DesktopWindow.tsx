import { useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { displayAppTitle } from "@/i18n/displayAppTitle";
import { cn } from "@/lib/cn";
import { AppWindowContent } from "./appContent";
import { DesktopAppSymbol } from "./icons";
import { detectSnapZone, type SnapZone } from "./snap";
import type { WindowState } from "./types";
import { WindowTitleBar } from "./WindowTitleBar";

type Props = {
  win: WindowState;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (position: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onSnapPreview: (zone: SnapZone) => void;
  onSnapApply: (zone: Exclude<SnapZone, null>) => void;
};

export function DesktopWindow({
  win,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  onResize,
  onSnapPreview,
  onSnapApply,
}: Props) {
  const { t, i18n } = useTranslation("desktopChrome");
  void i18n.language;
  const dragOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);
  const snapZoneRef = useRef<SnapZone>(null);
  const symbol = (
    <DesktopAppSymbol
      item={{ type: win.type, app_component: win.appComponent }}
      size="sm"
    />
  );

  const onDragStart = (e: React.PointerEvent) => {
    if (win.isMaximized) return;
    if ((e.target as HTMLElement).closest("[data-desktop-window-control]")) {
      return;
    }
    onFocus();
    dragOrigin.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      x: win.position.x,
      y: win.position.y,
    };
    snapZoneRef.current = null;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* untrusted / synthetic pointers may not support capture */
    }

    const onMovePtr = (ev: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      onMove({
        x: origin.x + (ev.clientX - origin.pointerX),
        y: Math.max(0, origin.y + (ev.clientY - origin.pointerY)),
      });
      const zone = detectSnapZone(ev.clientX, ev.clientY);
      snapZoneRef.current = zone;
      onSnapPreview(zone);
    };
    const onUp = (ev: PointerEvent) => {
      dragOrigin.current = null;
      const zone = snapZoneRef.current;
      snapZoneRef.current = null;
      onSnapPreview(null);
      if (zone) onSnapApply(zone);
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = win.size.width;
    const startH = win.size.height;

    const onMovePtr = (ev: PointerEvent) => {
      onResize({
        width: startW + (ev.clientX - startX),
        height: startH + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className={cn(
        "pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl",
        "border border-white/12 bg-panel/95 shadow-[0_24px_80px_rgb(0_0_0/0.45)]",
        "backdrop-blur-md",
      )}
      style={{
        left: win.position.x,
        top: win.position.y,
        width: win.size.width,
        height: win.size.height,
        zIndex: win.zIndex,
      }}
      onPointerDown={onFocus}
      data-desktop-window-id={win.id}
    >
      <WindowTitleBar
        title={displayAppTitle(win.appComponent, win.title)}
        icon={symbol}
        isMaximized={win.isMaximized}
        onClose={onClose}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onDragStart={onDragStart}
      />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <AppWindowContent win={win} />
      </div>
      {!win.isMaximized ? (
        <button
          type="button"
          aria-label={t("window.resize")}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          onPointerDown={onResizePointerDown}
        />
      ) : null}
    </motion.section>
  );
}
