import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "../relay/relay-connection";
import { type NostrSource, sameSource } from "./source";

const source = (overrides: Partial<NostrSource> = {}): NostrSource => ({
  type: "nostr",
  filters: [{ kinds: [1], authors: ["a".repeat(64)] }],
  relays: ["wss://a.example/" as RelayUrl],
  ...overrides,
});

describe("sameSource", () => {
  it("作り直しただけで中身が同じなら、同じとみなす", () => {
    expect(sameSource(source(), source())).toBe(true);
  });

  it("フィルタかリレーが違えば、違うとみなす", () => {
    expect(sameSource(source(), source({ filters: [{ kinds: [7] }] }))).toBe(
      false,
    );
    expect(
      sameSource(
        source(),
        source({ relays: ["wss://b.example/" as RelayUrl] }),
      ),
    ).toBe(false);
  });
});
