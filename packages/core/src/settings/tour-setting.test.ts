import { describe, expect, it } from "vitest";
import { loadTourSeen, saveTourSeen } from "./tour-setting";

describe("tour-setting", () => {
  it("まだ何も残っていなければ、見ていない", () => {
    expect(loadTourSeen(null)).toBe(false);
  });

  it("見たと残したものは、見た", () => {
    expect(loadTourSeen(saveTourSeen())).toBe(true);
  });

  it("読めない値は、見ていないとみなす", () => {
    expect(loadTourSeen("yes")).toBe(false);
  });
});
