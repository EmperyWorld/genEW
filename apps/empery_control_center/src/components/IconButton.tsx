import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({
  label,
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-muted transition-colors",
        "hover:bg-signal-soft hover:text-signal",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecc-focus-ring)]",
        "disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
