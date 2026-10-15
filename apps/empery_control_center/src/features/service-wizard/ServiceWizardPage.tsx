import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { ErrorBanner } from "../../components/ErrorBanner";
import { CommandConsole } from "../command-console/CommandConsole";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  reducedMotionVariants,
  stageTransition,
} from "../../theme/motion";
import { useNeedsLogin } from "@/features/auth/useNeedsLogin";
import { LoginGatePanel } from "@/features/auth/LoginGatePanel";
import { useEccStore } from "@/state/store";
import { WizardStageRail } from "./WizardStageRail";
import { StagePlan } from "./StagePlan";
import { StageImplement } from "./StageImplement";
import { StageVerify } from "./StageVerify";
import { StageEvolve } from "./StageEvolve";
import { useWizardSession } from "./useWizardSession";
import { WizardAgentWaitingPanel } from "./WizardAgentWaitingPanel";

export interface ServiceWizardPageProps {
  /** Resume from job id (route param `/wizard/:sessionId`). */
  sessionId?: string;
  className?: string;
}

export function ServiceWizardPage({
  sessionId,
  className = "",
}: ServiceWizardPageProps) {
  const { t } = useTranslation();
  const wizard = useWizardSession(sessionId);
  const needsLogin = useNeedsLogin();
  const reduced = useReducedMotion();
  const liveConsoleLines = useEccStore((s) => s.lines);
  const consoleLines = useMemo(
    () => [...liveConsoleLines, ...wizard.consoleLines],
    [liveConsoleLines, wizard.consoleLines],
  );

  return (
    <div
      className={[
        "flex h-full min-h-0 flex-col gap-px bg-line lg:flex-row",
        className,
      ].join(" ")}
    >
      <Panel
        title={t("wizard.title")}
        className="min-h-0 flex-1 rounded-none border-0 bg-field lg:rounded-none"
        flush
      >
        <div className="flex h-full min-h-0 flex-col gap-5 p-4 md:p-6">
          <WizardStageRail
            stage={wizard.stage}
            completed={wizard.completed}
            onSelect={wizard.setStage}
            disabled={wizard.status === "running"}
          />

          {wizard.error ? (
            <ErrorBanner
              message={wizard.error}
              code={wizard.errorCode}
              onDismiss={wizard.clearError}
            />
          ) : null}

          {wizard.showAgentWaiting && wizard.job ? (
            <WizardAgentWaitingPanel
              jobId={wizard.job.id}
              pickupHint={wizard.pickupHint}
              intent={wizard.form.intent || wizard.form.evolve_intent}
              serviceName={wizard.form.service_name}
            />
          ) : null}

          <div className="relative min-h-[280px] flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={wizard.stageDirection}>
              <motion.div
                key={wizard.stage}
                custom={wizard.stageDirection}
                variants={
                  reduced
                    ? reducedMotionVariants.stageTransition
                    : stageTransition
                }
                initial="enter"
                animate="center"
                exit="exit"
              >
                {wizard.stage === "plan" ? (
                  <StagePlan
                    form={wizard.form}
                    setForm={wizard.setForm}
                    status={wizard.status}
                    needsLogin={needsLogin}
                    onSubmit={() => void wizard.submitPlan()}
                  />
                ) : null}
                {wizard.stage === "implement" ? (
                  needsLogin ? (
                    <LoginGatePanel compact />
                  ) : (
                    <StageImplement
                      form={wizard.form}
                      setForm={wizard.setForm}
                      status={wizard.status}
                      planJob={wizard.jobsByStage.plan}
                      onSubmit={() => void wizard.submitImplement()}
                    />
                  )
                ) : null}
                {wizard.stage === "verify" ? (
                  needsLogin ? (
                    <LoginGatePanel compact />
                  ) : (
                    <StageVerify
                      form={wizard.form}
                      setForm={wizard.setForm}
                      status={wizard.status}
                      job={wizard.jobsByStage.verify ?? wizard.job}
                      onSubmit={() => void wizard.submitVerify()}
                    />
                  )
                ) : null}
                {wizard.stage === "evolve" ? (
                  needsLogin ? (
                    <LoginGatePanel compact />
                  ) : (
                    <StageEvolve
                      form={wizard.form}
                      setForm={wizard.setForm}
                      status={wizard.status}
                      onSubmit={() => void wizard.submitEvolve()}
                    />
                  )
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {wizard.job ? (
            <p className="font-mono text-[11px] text-ink-faint">
              {t("wizard.jobLine", {
                id: wizard.job.id,
                skill: wizard.job.skill,
                status: wizard.job.status,
              })}
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="min-h-[220px] w-full border-t border-line bg-console-bg lg:w-[380px] lg:shrink-0 lg:border-l lg:border-t-0">
        <CommandConsole
          externalLines={consoleLines}
          enableAuditPolling={false}
          className="h-full rounded-none border-0"
        />
      </div>
    </div>
  );
}
