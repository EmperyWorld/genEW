import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Panel } from "@/components/Panel";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useDedmorozSession } from "./useDedmorozSession";

/** ECC chat surface — EliteEW CompanionSlim layout adapted to Empery tokens. */
function DedmorozPageInner() {
  const { t } = useTranslation();
  const session = useDedmorozSession();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages, session.busy]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || session.busy) return;
    setDraft("");
    await session.sendMessage(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={t("dedmoroz.title")}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-3 p-4">
          <p className="font-body text-sm text-ink-muted">
            {t("dedmoroz.subtitle")}
          </p>
          {session.error ? (
            <ErrorBanner
              message={session.error}
              onDismiss={() => void session.reload()}
            />
          ) : null}
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--ecc-radius-md)] border border-line bg-canvas">
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                {session.loading ? <SkeletonPulse className="h-24 w-full" /> : null}
                {!session.loading && session.messages.length === 0 ? (
                  <p className="font-body text-sm text-ink-muted">
                    {t("dedmoroz.empty")}
                  </p>
                ) : null}
                {session.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "ml-10 rounded-[var(--ecc-radius-sm)] bg-[var(--ecc-signal-soft)] px-3 py-2"
                        : "mr-10 rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-2"
                    }
                  >
                    <p className="mb-1 font-[Sora,sans-serif] text-[10px] uppercase tracking-wide text-ink-muted">
                      {m.role === "user"
                        ? t("dedmoroz.you")
                        : t("dedmoroz.assistant")}
                    </p>
                    <p className="whitespace-pre-wrap font-body text-sm leading-relaxed text-ink">
                      {m.content}
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </section>
            <section className="flex min-h-0 flex-col gap-2 rounded-[var(--ecc-radius-md)] border border-line bg-field p-3">
              <form
                className="flex min-h-0 flex-1 flex-col gap-2"
                onSubmit={(e) => void onSend(e)}
              >
                <label className="flex min-h-0 flex-1 flex-col gap-1">
                  <span className="font-[Sora,sans-serif] text-xs text-ink-muted">
                    {t("dedmoroz.placeholder")}
                  </span>
                  <textarea
                    className="min-h-[10rem] w-full flex-1 resize-none rounded-[var(--ecc-radius-sm)] border border-line bg-canvas px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
                    value={draft}
                    disabled={session.busy || session.loading}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t("dedmoroz.placeholder")}
                  />
                </label>
                <Button type="submit" disabled={session.busy || !draft.trim()}>
                  {session.busy ? "…" : t("dedmoroz.send")}
                </Button>
              </form>
            </section>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function DedmorozPage() {
  return (
    <RequireAuth>
      <DedmorozPageInner />
    </RequireAuth>
  );
}
