import { describe, expect, it } from "vite-plus/test";
import { type OlderPageRelay, nextOlder } from "./older-page";

const request = { until: 100, limit: 3 };
const relay = (
  url: string,
  reason: OlderPageRelay["reason"],
  events: number[] = [],
): OlderPageRelay => ({
  url,
  reason,
  received: events.length,
  ...(events.length > 0 ? { oldest: Math.min(...events) } : {}),
});

describe("nextOlder", () => {
  it("返したリレーそれぞれの最古のうち、いちばん新しい時刻から次を取る", () => {
    // 捕まえる変異: 一覧の最古を次の until にする（疎なリレーの古い 1 件で、少なく返したリレーの区間を飛ばす）
    const page = {
      relays: [
        relay("wss://dense/", "eose", [99, 98]),
        relay("wss://sparse/", "eose", [10]),
      ],
    };
    expect(nextOlder(page, request, 10)).toEqual({ paging: "idle", until: 98 });
  });

  it("窓から押し出した分より古い時刻へは進まない", () => {
    const page = {
      relays: [
        relay("wss://a/", "eose", [99, 90, 80]),
        relay("wss://b/", "eose", [95, 70, 60]),
      ],
    };
    expect(nextOlder(page, request, 85)).toEqual({ paging: "idle", until: 85 });
  });

  it("全リレーが 0 件で EOSE を返したら、もう無い", () => {
    const page = {
      relays: [relay("wss://a/", "eose"), relay("wss://b/", "eose")],
    };
    expect(nextOlder(page, request, 100)).toEqual({ paging: "exhausted" });
  });

  it("持っているものしか返らず、どのリレーも 1 ページに満たなければ、もう無い", () => {
    const page = { relays: [relay("wss://a/", "eose", [100])] };
    expect(nextOlder(page, request, 100)).toEqual({ paging: "exhausted" });
  });

  it("同じ秒だけで 1 ページ埋まったら、もう無いとせず次の秒へ進む", () => {
    // 捕まえる変異: 増えなかったらもう無いとみなす（同じ秒に limit 件を超えると「これより前はありません」と出る）
    const page = { relays: [relay("wss://a/", "eose", [100, 100, 100])] };
    expect(nextOlder(page, request, 100)).toEqual({
      paging: "idle",
      until: 99,
    });
  });

  it.each(["timeout", "closed", "rejected"] as const)(
    "%s のリレーがあって先へ進めなければ、もう無いとせず取れなかったとする",
    (reason) => {
      // 捕まえる変異: 返事の無いリレーを 0 件の EOSE と同じに数える（接続が切れただけで末尾と出る）
      const page = {
        relays: [relay("wss://a/", "eose"), relay("wss://b/", reason)],
      };
      expect(nextOlder(page, request, 100)).toEqual({ paging: "failed" });
    },
  );

  it("返事の無いリレーがあっても、ほかのリレーで先へ進めたら続ける", () => {
    const page = {
      relays: [
        relay("wss://a/", "eose", [99, 97]),
        relay("wss://b/", "timeout"),
      ],
    };
    expect(nextOlder(page, request, 97)).toEqual({ paging: "idle", until: 97 });
  });

  it("取りに行けるリレーが 1 本も無ければ、取れなかったとする", () => {
    expect(nextOlder({ relays: [] }, request, 100)).toEqual({
      paging: "failed",
    });
  });
});
