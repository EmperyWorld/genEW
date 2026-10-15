import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { CommandConsole } from "@/features/command-console/CommandConsole";
import { LoginGatePanel } from "@/features/auth/LoginGatePanel";
import { useNeedsLogin } from "@/features/auth/useNeedsLogin";
import { canAutonomousWrite } from "@/lib/autonomousRbac";
import { useEccStore } from "@/state/store";
import { AutonomousModeToggle } from "./AutonomousModeToggle";
import { ProviderSelect } from "./ProviderSelect";
import { LlmHealthBeacon } from "./LlmHealthBeacon";
import { IntentionSubmitForm } from "./IntentionSubmitForm";
import { EvolveIntentionPanel } from "./EvolveIntentionPanel";
import { AutonomousJobList } from "./AutonomousJobList";
import { HandsCapsuleCleanup } from "./HandsCapsuleCleanup";
import { MemorySearchLight } from "./MemorySearchLight";
import { useAutonomousSession } from "./useAutonomousSession";

type IntentionMode = "create" | "evolve";

export function AutonomousPage() {
  const { t } = useTranslation();
  const needsLogin = useNeedsLogin();
  const session = useAutonomousSession({ enabled: !needsLogin });
  const authUser = useEccStore((s) => s.authUser);
  const writeAccess = canAutonomousWrite(authUser?.roles);
  const unavailable = session.errorCode === "ECC_EIC_UNAVAILABLE";
  const modeOff = !unavailable && session.mode != null && !session.mode.enabled;
  const writeDisabled = needsLogin || unavailable || !writeAccess;
  const liveConsoleLines = useEccStore((s) => s.lines);
  const consoleLines = useMemo(
    () => [...liveConsoleLines, ...session.consoleLines],
    [liveConsoleLines, session.consoleLines],
  );
  const [intentionMode, setIntentionMode] = useState<IntentionMode>("create");

  return (
    <div className="flex h-full min-h-0 w-full max-w-full min-w-0 flex-col gap-px overflow-x-hidden bg-line lg:flex-row">
      <Panel
        title={t("autonomous.title")}
        className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden rounded-none border-0 bg-field"
        flush
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-4 px-2">
            <AutonomousModeToggle
              mode={session.mode}
              busy={session.busy}
              disabled={writeDisabled}
              onToggle={(enabled) => void session.setAutonomousMode(enabled)}
            />
            <ProviderSelect
              providers={session.providers}
              busy={session.busy}
              disabled={writeDisabled}
              onChange={(id) => void session.setProvider(id)}
            />
            <LlmHealthBeacon health={session.llmHealth} />
          </div>
        }
      >
        <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col gap-6 overflow-x-hidden overflow-y-auto p-3 md:p-4">
          <p className="text-xs leading-relaxed text-ink-muted">
            {t("autonomous.genesisPreferred")}
          </p>

          {needsLogin ? (
            <LoginGatePanel />
          ) : null}

          {session.error && !needsLogin ? (
            <ErrorBanner
              message={session.error}
              code={session.errorCode ?? undefined}
              onDismiss={session.clearError}
            />
          ) : null}

          {modeOff && !needsLogin ? (
            <ErrorBanner
              message={t("autonomous.errors.modeDisabled")}
              code="EIC_MODE_DISABLED"
            />
          ) : null}

          {!writeAccess && authUser ? (
            <ErrorBanner
              message={t("autonomous.errors.readOnly")}
              code="ECC_FORBIDDEN"
            />
          ) : null}

          {needsLogin ? null : session.loading ? (
            <SkeletonPulse rows={8} />
          ) : (
            <div className="flex w-full min-w-0 max-w-full flex-col gap-6">
              <section className="min-w-0 max-w-full">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-[Sora,sans-serif] text-xs font-semibold tracking-wide text-[var(--ecc-ink-muted)]">
                    {t("autonomous.intention")}
                  </h3>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={[
                        "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        intentionMode === "create"
                          ? "border-signal bg-signal-soft text-ink"
                          : "border-line text-ink-muted",
                      ].join(" ")}
                      onClick={() => setIntentionMode("create")}
                    >
                      {t("autonomous.modeCreate")}
                    </button>
                    <button
                      type="button"
                      className={[
                        "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        intentionMode === "evolve"
                          ? "border-signal bg-signal-soft text-ink"
                          : "border-line text-ink-muted",
                      ].join(" ")}
                      onClick={() => setIntentionMode("evolve")}
                    >
                      {t("autonomous.modeEvolve")}
                    </button>
                  </div>
                </div>
                {intentionMode === "create" ? (
                  <IntentionSubmitForm
                    busy={session.busy}
                    disabled={writeDisabled || !session.mode?.enabled}
                    flash={session.enqueueFlash}
                    onSubmit={session.submitIntention}
                  />
                ) : (
                  <EvolveIntentionPanel
                    busy={session.busy}
                    disabled={writeDisabled || !session.mode?.enabled}
                    onSubmit={async (payload) =>
                      session.submitIntention(
                        payload.intention,
                        payload.serviceName,
                        payload.metadata,
                      )
                    }
                  />
                )}
              </section>

              <section className="min-w-0 max-w-full overflow-x-hidden">
                <h3 className="mb-2 font-[Sora,sans-serif] text-xs font-semibold tracking-wide text-[var(--ecc-ink-muted)]">
                  {t("autonomous.jobs")}
                </h3>
                <AutonomousJobList
                  jobs={session.jobs}
                  busy={session.busy}
                  writeDisabled={!writeAccess}
                  onPause={(id) => void session.pauseJob(id)}
                  onResume={(id) => void session.resumeJob(id)}
                  onCancel={(id) => void session.cancelJob(id)}
                  onServiceDeleted={session.dismissJobsForService}
                />
              </section>

              <section className="min-w-0 max-w-full overflow-x-hidden">
                <HandsCapsuleCleanup disabled={writeDisabled} />
              </section>

              <section className="min-w-0 max-w-full">
                <h3 className="mb-2 font-[Sora,sans-serif] text-xs font-semibold tracking-wide text-[var(--ecc-ink-muted)]">
                  {t("autonomous.memory")}
                </h3>
                <MemorySearchLight
                  hits={session.memoryHits}
                  query={session.memoryQuery}
                  serviceName={session.memoryService}
                  onSearch={(q, svc) => void session.searchMemory(q, svc)}
                />
              </section>
            </div>
          )}
        </div>
      </Panel>

      <div className="min-h-[220px] w-full min-w-0 border-t border-line bg-console-bg lg:w-[380px] lg:shrink-0 lg:border-l lg:border-t-0">
        <CommandConsole
          externalLines={consoleLines}
          enableAuditPolling={false}
          className="h-full rounded-none border-0"
        />
      </div>
    </div>
  );
}
