import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", mono, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full rounded-sm border border-line bg-field px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecc-focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        mono && "font-mono",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
