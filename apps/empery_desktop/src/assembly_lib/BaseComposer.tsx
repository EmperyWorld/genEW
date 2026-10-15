import { cn } from "@/lib/cn";

export type BaseComposerProps = {
  title?: string | null;
  placeholder?: string | null;
  sendLabel?: string | null;
  value?: string;
  busy?: boolean;
  onChange?: (value: string) => void;
  onSend?: () => void;
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb composer — parent owns value/send. */
export function BaseComposer({
  title,
  placeholder,
  sendLabel,
  value = "",
  busy = false,
  onChange,
  onSend,
  className,
  "data-assembly-data-source": dataSource,
}: BaseComposerProps) {
  return (
    <section
      data-assembly-component="Composer"
      data-assembly-title={title ?? "Composer"}
      data-assembly-data-source={dataSource}
      className={cn(
        "flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3",
        className,
      )}
    >
      {title ? (
        <p className="text-[10px] uppercase tracking-wide text-ink-muted">
          {title}
        </p>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend?.();
          }
        }}
        rows={6}
        disabled={busy}
        placeholder={placeholder ?? "Ask…"}
        className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => onSend?.()}
        disabled={busy || !value.trim()}
        className="self-start rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
      >
        {busy ? "…" : (sendLabel ?? "Send")}
      </button>
    </section>
  );
}
