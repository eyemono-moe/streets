import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "../relay/relay-connection";
import type { RelayProgress } from "../write/write-progress";
import { describeRejection, writeStatus } from "./write-status";

const A = "wss://a/" as RelayUrl;
const B = "wss://b/" as RelayUrl;
const C = "wss://c/" as RelayUrl;

const sending = (...relays: RelayProgress[]) =>
  ({ phase: "sending", relays }) as const;
const pending = (relay: RelayUrl): RelayProgress => ({
  relay,
  state: "pending",
});
const ok = (relay: RelayUrl): RelayProgress => ({ relay, state: "accepted" });
const ng = (relay: RelayUrl, reason = "blocked"): RelayProgress => ({
  relay,
  state: "rejected",
  reason,
});

describe("writeStatus", () => {
  it("送る前の段は、何を待っているかを言う", () => {
    expect(writeStatus({ phase: "checking" }).text).toEqual({
      key: "write.status.checking",
    });
    expect(writeStatus({ phase: "signing" }).text).toEqual({
      key: "write.status.signing",
    });
  });

  it("まだどこにも届いていなければ、結果の出た数を数える", () => {
    expect(writeStatus(sending(ng(A), pending(B), pending(C)))).toMatchObject({
      tone: "working",
      text: { key: "write.status.sending", args: { done: 1, total: 3 } },
    });
  });

  it("1 本受け取った時点で保存したと言う。残りは待たない", () => {
    expect(writeStatus(sending(ok(A), pending(B), pending(C)))).toMatchObject({
      tone: "saved",
      text: {
        key: "write.status.savedSome",
        args: { accepted: 1 },
        count: 3,
      },
    });
  });

  it("全部受け取れば、ただ保存したと言う", () => {
    expect(writeStatus(sending(ok(A), ok(B)))).toMatchObject({
      tone: "saved",
      text: { key: "write.status.saved" },
      failures: [],
    });
  });

  it("届かなかったリレーがあれば、数と理由を添える", () => {
    const status = writeStatus(sending(ok(A), ng(B, "rate limited")));
    expect(status).toMatchObject({
      tone: "partial",
      text: { key: "write.status.partial", count: 1 },
      failures: [{ relay: B, reason: { detail: "rate limited" } }],
      // 前置きの無い理由は、そのまま出す
    });
  });

  it("全部断られたら失敗", () => {
    expect(writeStatus(sending(ng(A), ng(B))).tone).toBe("failed");
  });

  it("書き込みが投げた理由は、そのまま失敗として出す", () => {
    expect(
      writeStatus(
        { phase: "signing" },
        {
          kind: "failed",
          message: "署名器を利用できません",
        },
      ),
    ).toMatchObject({ tone: "failed", text: "署名器を利用できません" });
  });
});

describe("describeRejection", () => {
  it("NIP-01 の前置きを言い換え、リレーの説明は残す", () => {
    expect(describeRejection("rate-limited: slow down")).toEqual({
      reason: { key: "write.rejection.rateLimited" },
      detail: "slow down",
    });
    expect(describeRejection("blocked:")).toEqual({
      reason: { key: "write.rejection.blocked" },
    });
    expect(describeRejection("blocked")).toEqual({
      reason: { key: "write.rejection.blocked" },
    });
  });

  it("接続の失敗を言い換える", () => {
    expect(
      describeRejection("publish timed out for wss://a/ after 10000ms"),
    ).toEqual({ reason: { key: "write.rejection.timeout" } });
    expect(describeRejection("socket closed")).toEqual({
      reason: { key: "write.rejection.unreachable" },
    });
  });

  it("知らない理由はそのまま出す", () => {
    expect(describeRejection("something odd")).toEqual({
      detail: "something odd",
    });
    expect(describeRejection("")).toEqual({});
  });
});
