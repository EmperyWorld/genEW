import { cn } from "@/lib/cn";

export type ChatMessageView = {
  id: string;
  role: string;
  content: string;
};

export type BaseChatPanelProps = {
  title: string;
  emptyHint?: string | null;
  messages?: ChatMessageView[] | null;
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb chat transcript panel — no fetch. */
export function BaseChatPanel({
  title,
  emptyHint,
  messages,
  className,
  "data-assembly-data-source": dataSource,
}: BaseChatPanelProps) {
  const list = messages ?? [];
  return (
    <section
      data-assembly-component="ChatPanel"
      data-assembly-title={title}
      data-assembly-data-source={dataSource}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/10",
        className,
      )}
    >
      <header className="border-b border-white/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-ink-muted">
          {title}
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
        {list.length === 0 ? (
          <p className="text-xs text-ink-muted">
            {emptyHint ?? "No messages yet."}
          </p>
        ) : (
          list.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2",
                m.role === "user"
                  ? "ml-8 bg-signal/10 text-ink"
                  : "mr-8 bg-white/5 text-ink",
              )}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">
                {m.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
