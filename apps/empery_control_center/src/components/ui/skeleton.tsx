import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-line", className)}
      style={style}
      aria-hidden
    />
  );
}

export interface SkeletonPulseProps {
  className?: string;
  rows?: number;
}

/** Multi-row skeleton (compat with existing SkeletonPulse API). */
export function SkeletonPulse({
  className,
  rows = 1,
}: SkeletonPulseProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${72 - i * 8}%` }}
        />
      ))}
    </div>
  );
}
