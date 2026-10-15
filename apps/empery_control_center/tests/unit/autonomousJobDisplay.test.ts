import { describe, expect, it } from "vitest";
import type { AutonomousJob } from "@/api/types";
import {
  preferVerifySummary,
  primaryJobStatusLabel,
  resolveVerifyStatus,
} from "@/features/autonomous/autonomousJobDisplay";

function job(partial: Partial<AutonomousJob>): AutonomousJob {
  return {
    id: "j1",
    intention_id: "j1",
    status: "completed",
    stage: "verify",
    intention_text: "probe",
    provider_id: "local",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    artifact_paths: [],
    metadata: {},
    ...partial,
  };
}

describe("autonomousJobDisplay", () => {
  it("reads verify_status from metadata", () => {
    expect(
      resolveVerifyStatus(job({ metadata: { verify_status: "PASSED" } })),
    ).toBe("PASSED");
  });

  it("reads verify_status from result_summary prefix", () => {
    expect(
      resolveVerifyStatus(job({ result_summary: "verify_status=PASSED" })),
    ).toBe("PASSED");
  });

  it("prefers PASSED over completed when verify_status set", () => {
    expect(
      primaryJobStatusLabel(
        job({
          status: "completed",
          metadata: { verify_status: "PASSED" },
          result_summary: "**CRITICAL STATUS: ABORTED**",
        }),
      ),
    ).toBe("PASSED");
  });

  it("replaces ABORTED summary with verify_status when authoritative", () => {
    expect(
      preferVerifySummary(
        "**CRITICAL STATUS: ABORTED**\nDesign missing",
        "PASSED",
      ),
    ).toBe("verify_status=PASSED");
  });

  it("replaces conflicting FAILED prose when authoritative PASSED", () => {
    expect(
      preferVerifySummary("LLM says FAILED — abort", "PASSED"),
    ).toBe("verify_status=PASSED");
  });

  it("always surfaces authoritative verify when set", () => {
    expect(preferVerifySummary("ok done", "FAILED")).toBe("verify_status=FAILED");
  });
});
