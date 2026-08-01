import { describe, expect, it } from "vitest";
import { parseBudget } from "./parse-budget";

describe("parseBudget", () => {
  it("returns undefined when the param is absent (falls back to MAX_CONNECTIONS)", () => {
    expect(parseBudget(null)).toBeUndefined();
  });

  // Task 12 fix round 1, review finding: Number("") === 0, so an empty
  // ?budget= (present but valueless) silently became a zero budget instead
  // of falling back to the default.
  it("returns undefined for an empty string instead of a zero budget", () => {
    expect(parseBudget("")).toBeUndefined();
    expect(parseBudget("   ")).toBeUndefined();
  });

  it("returns undefined for a non-numeric value", () => {
    expect(parseBudget("abc")).toBeUndefined();
  });

  // Task 12 fix round 1, review finding: Number.isFinite alone lets
  // fractional budgets through, and `picks.length < budget` then silently
  // rounds the effective cap up (4.5 behaves like 5).
  it("returns undefined for a fractional value instead of rounding it up", () => {
    expect(parseBudget("4.5")).toBeUndefined();
  });

  it("returns undefined for zero or negative values", () => {
    expect(parseBudget("0")).toBeUndefined();
    expect(parseBudget("-1")).toBeUndefined();
  });

  it("returns the parsed integer for a valid value", () => {
    expect(parseBudget("4")).toBe(4);
  });
});
