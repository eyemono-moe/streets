import { describe, expect, it } from "vitest";
import { generateSign } from "./generate";

describe("generateSign", () => {
  it("同じ名前から同じ標識を作る", () => {
    expect(generateSign("alice")).toEqual(generateSign("alice"));
  });

  it("名前が違えば違う標識を作る", () => {
    expect(generateSign("alice")).not.toEqual(generateSign("bob"));
  });
});
