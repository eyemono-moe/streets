import { describe, expect, it } from "vitest";
import { decodeBech32, encodeBech32 } from "./nip19";

const pubkeyHex =
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

describe("nip19", () => {
  it("produces a value with the requested prefix", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(encoded.startsWith("npub1")).toBe(true);
    expect(encoded).toMatch(/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/);
  });

  it("round-trips a public key", () => {
    expect(decodeBech32(encodeBech32("npub", pubkeyHex))).toEqual({
      prefix: "npub",
      dataHex: pubkeyHex,
    });
  });

  it("round-trips an arbitrary prefix", () => {
    expect(decodeBech32(encodeBech32("note", pubkeyHex))).toEqual({
      prefix: "note",
      dataHex: pubkeyHex,
    });
  });

  it("throws on a value with a broken checksum", () => {
    const encoded = encodeBech32("npub", pubkeyHex);
    expect(() =>
      decodeBech32(
        `${encoded.slice(0, -1)}${encoded.at(-1) === "q" ? "p" : "q"}`,
      ),
    ).toThrow();
  });
});
