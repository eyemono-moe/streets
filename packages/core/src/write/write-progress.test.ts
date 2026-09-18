import { describe, expect, it } from "vitest";
import type { RelayUrl } from "../relay/relay-connection";
import { pendingRelays, settleRelay, summarizeRelays } from "./write-progress";

const A = "wss://a/" as RelayUrl;
const B = "wss://b/" as RelayUrl;
const C = "wss://c/" as RelayUrl;

describe("書き込みの進み具合", () => {
  it("はじめは全部待っている", () => {
    expect(summarizeRelays(pendingRelays([A, B]))).toEqual({
      total: 2,
      accepted: 0,
      rejected: 0,
      pending: 2,
      saved: false,
      finished: false,
    });
  });

  it("1 本受け取れば保存できたとみなす。全部出るまでは終わっていない", () => {
    const relays = settleRelay(pendingRelays([A, B, C]), A, { accepted: true });
    expect(summarizeRelays(relays)).toMatchObject({
      saved: true,
      finished: false,
      pending: 2,
    });
  });

  it("断られた理由を残し、元の配列は書き換えない", () => {
    const before = pendingRelays([A, B]);
    const after = settleRelay(before, B, {
      accepted: false,
      reason: "blocked",
    });
    expect(after[1]).toEqual({
      relay: B,
      state: "rejected",
      reason: "blocked",
    });
    expect(before[1]?.state).toBe("pending");
  });

  it("全部断られたら、保存できていないまま終わる", () => {
    let relays = pendingRelays([A, B]);
    relays = settleRelay(relays, A, { accepted: false, reason: "x" });
    relays = settleRelay(relays, B, { accepted: false, reason: "y" });
    expect(summarizeRelays(relays)).toMatchObject({
      saved: false,
      finished: true,
      rejected: 2,
    });
  });
});
