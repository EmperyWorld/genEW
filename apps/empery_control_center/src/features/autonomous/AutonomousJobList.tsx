import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { Bot } from "lucide-react";
import { PATHS } from "@/routes/paths";
import type { AutonomousJob } from "@/api/types";
import { AutonomousJobRow } from "./AutonomousJobRow";

export interface AutonomousJobListProps {
  jobs: AutonomousJob[];
  busy?: boolean;
  writeDisabled?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onServiceDeleted?: (serviceName: string) => void;
}

export function AutonomousJobList({
  jobs,
  busy = false,
  writeDisabled = false,
  onPause,
  onResume,
  onCancel,
  onServiceDeleted,
}: AutonomousJobListProps) {
  const { t } = useTranslation();

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<Bot className="h-6 w-6" strokeWidth={1.5} />}
        title={t("autonomous.jobsEmpty")}
        description={t("autonomous.jobsEmptyHint")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to={PATHS.opsHealth}>{t("onboarding.linkHealth")}</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to={PATHS.opsMap}>{t("onboarding.linkMap")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-180 border-collapse text-left">
        <thead className="sticky top-0 z-1 bg-panel-raised">
          <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            <th className="w-8 px-2 py-2 font-body" scope="col" />
            <th className="min-w-50 px-2 py-2 font-body" scope="col">
              {t("autonomous.table.intention")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.service")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.verify")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.stage")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.provider")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.updated")}
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-body" scope="col">
              {t("autonomous.table.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <AutonomousJobRow
              key={job.id}
              job={job}
              busy={busy}
              writeDisabled={writeDisabled}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
              onServiceDeleted={onServiceDeleted}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
