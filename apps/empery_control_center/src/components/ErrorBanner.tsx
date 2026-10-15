import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./IconButton";

export interface ErrorBannerProps {
  message: string;
  code?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, code, onDismiss }: ErrorBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-sm border border-down/40 bg-down/10 px-3 py-2 text-sm text-console-err"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{message}</p>
        {code ? (
          <p className="mt-0.5 font-mono text-[11px] opacity-70">{code}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <IconButton
          label={t("common.dismiss")}
          onClick={onDismiss}
          className="h-6 w-6"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </IconButton>
      ) : null}
    </div>
  );
}
