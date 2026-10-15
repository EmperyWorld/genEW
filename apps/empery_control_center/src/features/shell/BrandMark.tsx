import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PATHS } from "@/routes/paths";
import { cn } from "@/lib/cn";

interface BrandMarkProps {
  /** Hero-scale on landing; compact in shell rail. */
  size?: "hero" | "compact";
  className?: string;
}

export function BrandMark({ size = "compact", className }: BrandMarkProps) {
  const { t } = useTranslation();
  const isHero = size === "hero";

  return (
    <Link
      to={PATHS.home}
      className={cn("group inline-flex items-center gap-3 no-underline", className)}
      aria-label={t("shell.brandHome")}
    >
      <img
        src="/brand/empery-mark.svg"
        alt=""
        width={isHero ? 56 : 32}
        height={isHero ? 56 : 32}
        className="shrink-0"
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-ink",
            isHero ? "text-5xl md:text-6xl" : "text-lg",
          )}
        >
          Empery
        </span>
        <span
          className={cn(
            "font-body text-metal",
            isHero
              ? "mt-2 text-base tracking-wide"
              : "mt-0.5 text-[11px] uppercase tracking-wider",
          )}
        >
          {t("shell.brandSubtitle")}
        </span>
      </span>
    </Link>
  );
}
