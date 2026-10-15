import { cn } from "@/lib/cn";

export type BaseJobFormProps = {
  title?: string | null;
  placeholder?: string | null;
  buttonLabel?: string | null;
  value?: string;
  busy?: boolean;
  onChange?: (value: string) => void;
  onGenerate?: () => void;
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb studio prompt form — parent owns value/generate. */
export function BaseJobForm({
  title,
  placeholder,
  buttonLabel,
  value = "",
  busy = false,
  onChange,
  onGenerate,
  className,
  "data-assembly-data-source": dataSource,
}: BaseJobFormProps) {
  return (
    <section
      data-assembly-component="JobForm"
      data-assembly-title={title ?? "Generate"}
      data-assembly-data-source={dataSource}
      className={cn("flex flex-col gap-2", className)}
    >
      {title ? (
        <p className="text-[10px] uppercase tracking-wide text-ink-muted">
          {title}
        </p>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        rows={4}
        disabled={busy}
        placeholder={placeholder ?? "Describe what to generate…"}
        className="resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40"
      />
      <button
        type="button"
        onClick={() => onGenerate?.()}
        disabled={busy || !value.trim()}
        className="self-start rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
      >
        {busy ? "Working…" : (buttonLabel ?? "Generate")}
      </button>
    </section>
  );
}
