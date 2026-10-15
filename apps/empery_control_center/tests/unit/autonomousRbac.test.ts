import { describe, expect, it } from "vitest";
import { canAutonomousWrite } from "@/lib/autonomousRbac";

describe("canAutonomousWrite", () => {
  it("denies viewer-only roles", () => {
    expect(canAutonomousWrite(["viewer"])).toBe(false);
  });

  it("allows admin, operator, and member", () => {
    expect(canAutonomousWrite(["admin"])).toBe(true);
    expect(canAutonomousWrite(["operator"])).toBe(true);
    expect(canAutonomousWrite(["member"])).toBe(true);
  });

  it("allows when viewer is paired with a write role", () => {
    expect(canAutonomousWrite(["viewer", "operator"])).toBe(true);
  });

  it("denies empty or undefined roles", () => {
    expect(canAutonomousWrite([])).toBe(false);
    expect(canAutonomousWrite(undefined)).toBe(false);
  });
});
