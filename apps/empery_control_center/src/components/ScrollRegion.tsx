import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type UIEvent,
} from "react";

export interface ScrollRegionHandle {
  scrollToBottom: () => void;
  isNearBottom: () => boolean;
}

export interface ScrollRegionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onStickChange?: (stuck: boolean) => void;
  stickThresholdPx?: number;
}

export const ScrollRegion = forwardRef<ScrollRegionHandle, ScrollRegionProps>(
  function ScrollRegion(
    {
      children,
      className = "",
      onStickChange,
      stickThresholdPx = 48,
      onScroll,
      ...rest
    },
    ref,
  ) {
    const elRef = useRef<HTMLDivElement>(null);

    const isNearBottom = useCallback(() => {
      const el = elRef.current;
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight <= stickThresholdPx;
    }, [stickThresholdPx]);

    const scrollToBottom = useCallback(() => {
      const el = elRef.current;
      if (!el) return;
      // Only the overflow container — never scrollIntoView / window.
      el.scrollTop = el.scrollHeight;
    }, []);

    useImperativeHandle(ref, () => ({ scrollToBottom, isNearBottom }), [
      scrollToBottom,
      isNearBottom,
    ]);

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
      onStickChange?.(isNearBottom());
      onScroll?.(e);
    };

    return (
      <div
        ref={elRef}
        onScroll={handleScroll}
        className={[
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
          className,
        ].join(" ")}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
