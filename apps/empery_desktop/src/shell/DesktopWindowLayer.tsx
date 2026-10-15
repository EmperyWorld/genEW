import { AnimatePresence } from "framer-motion";
import { DesktopWindow } from "./DesktopWindow";
import type { SnapZone } from "./snap";
import type { WindowManager } from "./useWindowManager";

type Props = {
  wm: WindowManager;
  onSnapPreview: (zone: SnapZone) => void;
};

export function DesktopWindowLayer({ wm, onSnapPreview }: Props) {
  // Layer stays pointer-events-none so desktop icons remain clickable.
  // Each window opts back in with pointer-events-auto.
  return (
    <div className="pointer-events-none absolute inset-0 z-30 pb-14">
      <AnimatePresence>
        {wm.visibleWindows.map((win) => (
          <DesktopWindow
            key={win.id}
            win={win}
            onFocus={() => wm.focusWindow(win.id)}
            onClose={() => wm.closeWindow(win.id)}
            onMinimize={() => wm.minimizeWindow(win.id)}
            onMaximize={() => wm.maximizeWindow(win.id)}
            onMove={(position) => wm.moveWindow(win.id, position)}
            onResize={(size) => wm.resizeWindow(win.id, size)}
            onSnapPreview={onSnapPreview}
            onSnapApply={(zone) => wm.snapWindow(win.id, zone)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
