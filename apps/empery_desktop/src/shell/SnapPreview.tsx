import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { snapPreviewStyle, type SnapZone } from "./snap";

type Props = {
  zone: SnapZone;
};

export function SnapPreview({ zone }: Props) {
  return (
    <AnimatePresence>
      {zone ? (
        <div
          className="pointer-events-none absolute inset-0 z-[25] pb-14"
          aria-hidden
          data-desktop-snap-preview=""
        >
          <div className="relative h-full w-full p-1">
            <motion.div
              key={zone}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={snapPreviewStyle(zone)}
              className="p-1"
            >
              <div
                className={cn(
                  "h-full w-full rounded-xl border border-signal/40",
                  "bg-signal/10 shadow-[inset_0_0_0_1px_rgb(94_234_212/0.15)]",
                )}
              />
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
