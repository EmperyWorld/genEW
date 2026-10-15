import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-line bg-panel-raised text-ink-muted",
        signal: "border-signal/40 bg-signal-soft text-signal",
        metal: "border-metal/40 bg-metal/10 text-metal",
        ok: "border-ok/40 bg-signal-soft text-ok",
        warn: "border-degraded/40 bg-degraded/10 text-degraded",
        danger: "border-down/40 bg-down/10 text-down",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
