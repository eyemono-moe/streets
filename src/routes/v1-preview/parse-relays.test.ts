import { describe, expect, it } from "vitest";
import { parseRelays } from "./parse-relays";

describe("parseRelays", () => {
  it("returns undefined when the param is absent (falls back to real relays)", () => {
    expect(parseRelays(null)).toBeUndefined();
  });

  it("returns undefined for an empty string instead of an empty relay list", () => {
    expect(parseRelays("")).toBeUndefined();
  });

  it("returns undefined when every entry is blank after trimming", () => {
    expect(parseRelays(",, ,")).toBeUndefined();
  });

  it("splits a comma-separated list and trims whitespace", () => {
    expect(parseRelays("ws://127.0.0.1:8080/, ws://127.0.0.1:8081/")).toEqual([
      "ws://127.0.0.1:8080/",
      "ws://127.0.0.1:8081/",
    ]);
  });

  it("returns a single-element list for one URL", () => {
    expect(parseRelays("ws://127.0.0.1:8080/")).toEqual([
      "ws://127.0.0.1:8080/",
    ]);
  });

  it("drops blank entries produced by stray commas", () => {
    expect(parseRelays("ws://127.0.0.1:8080/,,ws://127.0.0.1:8081/")).toEqual([
      "ws://127.0.0.1:8080/",
      "ws://127.0.0.1:8081/",
    ]);
  });
});
