import { describe, expect, it } from "vitest";
import type { OrchestrationJob } from "../../src/api/types";
import {
  isAgentWaiting,
  isDemoStubJob,
} from "../../src/features/service-wizard/wizardJobUtils";

function job(partial: Partial<OrchestrationJob>): OrchestrationJob {
  return {
    id: "j1",
    skill: "plan",
    status: "pending",
    ...partial,
  };
}

describe("wizardJobUtils", () => {
  describe("isDemoStubJob", () => {
    it("detects metadata.demo_stub", () => {
      expect(isDemoStubJob(job({ metadata: { demo_stub: true } }))).toBe(true);
    });

    it("detects mode=demo", () => {
      expect(isDemoStubJob(job({ mode: "demo" }))).toBe(true);
    });

    it("detects DEMO in result_summary", () => {
      expect(
        isDemoStubJob(job({ result_summary: "Demo plan stubs written" })),
      ).toBe(true);
    });

    it("detects DEMO_PASSED verify_status", () => {
      expect(
        isDemoStubJob(job({ metadata: { verify_status: "DEMO_PASSED" } })),
      ).toBe(true);
    });

    it("returns false for agent jobs", () => {
      expect(
        isDemoStubJob(
          job({
            mode: "agent",
            metadata: { demo_stub: false },
            result_summary: "verify_status=PASSED",
          }),
        ),
      ).toBe(false);
    });
  });

  describe("isAgentWaiting", () => {
    it("is true for pending agent job while UI running", () => {
      expect(isAgentWaiting(job({ status: "pending" }), "running")).toBe(true);
    });

    it("is false when idle", () => {
      expect(isAgentWaiting(job({ status: "pending" }), "idle")).toBe(false);
    });
  });
});
