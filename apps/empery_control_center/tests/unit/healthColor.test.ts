import { describe, expect, it } from "vitest";
import { healthLabel, healthToken } from "../../src/lib/healthColor";

describe("healthColor", () => {
  it("maps status to CSS tokens", () => {
    expect(healthToken("ok")).toContain("--ecc-ok");
    expect(healthToken("degraded")).toContain("--ecc-degraded");
    expect(healthToken("down")).toContain("--ecc-down");
    expect(healthToken("unknown")).toContain("--ecc-unknown");
  });

  it("provides human labels", () => {
    expect(healthLabel("ok")).toBe("Healthy");
    expect(healthLabel("unknown")).toBe("Unknown");
  });
});
