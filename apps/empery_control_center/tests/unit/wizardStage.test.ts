import { describe, expect, it } from "vitest";
import { WIZARD_STAGES } from "../../src/features/service-wizard/WizardStageRail";

describe("wizard stages", () => {
  it("follows Plan → Implement → Verify → Evolve", () => {
    expect(WIZARD_STAGES.map((s) => s.id)).toEqual([
      "plan",
      "implement",
      "verify",
      "evolve",
    ]);
  });
});
