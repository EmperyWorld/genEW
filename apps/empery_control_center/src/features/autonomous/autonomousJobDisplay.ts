import type { AutonomousJob } from "@/api/types";

export type VerifyStatus = "PASSED" | "FAILED" | "UNKNOWN" | "PENDING";

const VERIFY_PREFIX = /^verify_status=(PASSED|FAILED|UNKNOWN|PENDING)/i;

export function resolveVerifyStatus(
  job: AutonomousJob,
): VerifyStatus | null {
  const meta = job.metadata?.verify_status;
  if (typeof meta === "string" && meta.trim()) {
    const upper = meta.toUpperCase();
    if (upper.includes("DEMO")) return "FAILED";
    if (
      upper === "PASSED" ||
      upper === "FAILED" ||
      upper === "UNKNOWN" ||
      upper === "PENDING"
    ) {
      return upper;
    }
  }
  const summary = job.result_summary?.trim() ?? "";
  const match = VERIFY_PREFIX.exec(summary);
  if (match) {
    return match[1]!.toUpperCase() as VerifyStatus;
  }
  if (summary.toUpperCase().includes("DEMO")) return "FAILED";
  return null;
}

/** Prefer authoritative verify_status over ABORTED LLM prose in summaries. */
export function primaryJobStatusLabel(job: AutonomousJob): string {
  const verify = resolveVerifyStatus(job);
  if (verify) {
    return verify;
  }
  return job.status;
}

export function consoleJobMessage(
  job: AutonomousJob,
  template: (values: {
    id: string;
    status: string;
    stage: string;
    verifyStatus: string | null;
  }) => string,
): string {
  const verify = resolveVerifyStatus(job);
  return template({
    id: job.id,
    status: verify ?? job.status,
    stage: job.stage,
    verifyStatus: verify,
  });
}

export function summaryLooksAborted(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\bABORTED\b/i.test(text);
}

/**
 * Console / feed line: authoritative verify_status wins over conflicting LLM prose
 * (ABORTED, FAILED narrative when gate says PASSED, etc.).
 */
export function preferVerifySummary(
  summary: string,
  verifyStatus: string | null | undefined,
): string {
  const auth =
    verifyStatus &&
    ["PASSED", "FAILED", "UNKNOWN", "PENDING"].includes(verifyStatus.toUpperCase())
      ? verifyStatus.toUpperCase()
      : null;
  if (auth) {
    const prefix = `verify_status=${auth}`;
    if (!summary.trim()) return prefix;
    if (VERIFY_PREFIX.test(summary)) {
      const matched = summary.match(VERIFY_PREFIX)![1]!.toUpperCase();
      if (matched !== auth) return prefix;
      return summary.match(VERIFY_PREFIX)![0]!;
    }
    if (summaryLooksAborted(summary)) return prefix;
    // Conflicting FAILED/PASSED words in prose vs authoritative gate.
    const proseFail = /\bFAILED\b/i.test(summary);
    const prosePass = /\bPASSED\b/i.test(summary);
    if (auth === "PASSED" && proseFail && !prosePass) return prefix;
    if (auth === "FAILED" && prosePass && !proseFail) return prefix;
    return prefix;
  }
  if (VERIFY_PREFIX.test(summary)) {
    return summary.match(VERIFY_PREFIX)![0]!;
  }
  return summary;
}
