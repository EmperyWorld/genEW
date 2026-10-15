import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { ErrorBanner } from "../../components/ErrorBanner";
import { SkeletonPulse } from "../../components/SkeletonPulse";
import { EmptyState } from "../../components/EmptyState";
import { Network } from "lucide-react";
import { CommandConsole } from "../command-console/CommandConsole";
import { InsightFeed } from "../insight-feed/InsightFeed";
import { InteractionProbe } from "./InteractionProbe";
import { SandboxCanvas } from "./SandboxCanvas";
import { useSandboxSession } from "./useSandboxSession";

export interface SandboxPageProps {
  sessionId?: string;
  className?: string;
}

export function SandboxPage({
  sessionId,
  className = "",
}: SandboxPageProps) {
  const { t } = useTranslation();
  const session = useSandboxSession({ sessionId });

  return (
    <div
      className={[
        "flex h-full min-h-0 flex-col gap-3",
        className,
      ].join(" ")}
    >
      <Panel title={t("sandbox.title")} className="min-h-0 flex-1" flush>
        <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:flex-row">
          <div className="flex min-h-0 w-full flex-col gap-3 lg:w-[340px] lg:shrink-0">
            {session.error ? (
              <ErrorBanner
                message={session.error}
                code={session.errorCode}
                onDismiss={session.clearError}
              />
            ) : null}
            {session.loading ? (
              <SkeletonPulse rows={6} />
            ) : session.services.length === 0 ? (
              <EmptyState
                icon={<Network className="h-6 w-6" strokeWidth={1.5} />}
                title={t("sandbox.registryEmpty")}
                description={t("sandbox.registryEmptyHint")}
              />
            ) : (
              <InteractionProbe
                services={session.services}
                form={session.form}
                setForm={session.setForm}
                probing={session.probing}
                onFire={() => void session.fireProbe()}
              />
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <SandboxCanvas
              form={session.form}
              lastProbe={session.lastProbe}
            />
            <div className="grid h-[min(36vh,280px)] min-h-[180px] shrink-0 gap-3 overflow-hidden lg:grid-cols-2">
              <CommandConsole
                externalLines={session.consoleLines}
                enableAuditPolling={false}
                className="h-full min-h-0"
              />
              <InsightFeed
                externalItems={session.feedItems}
                enablePolling={false}
                newestAtBottom
                includeAuditHooks={false}
                className="h-full min-h-0"
              />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
