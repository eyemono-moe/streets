import { describe, expect, it } from "vite-plus/test";
import { estimateWindow, nextNewer } from "./newer-page";
import type { OlderPageRelay } from "./older-page";

const relay = (
  url: string,
  reason: OlderPageRelay["reason"],
  received: number,
): OlderPageRelay => ({ url, reason, received });

const request = { since: 1000, until: 1400, limit: 3, now: 5000 };

describe("nextNewer", () => {
  it("どのリレーも limit 未満で EOSE を返したら、窓の上端まで進む", () => {
    const page = {
      relays: [relay("wss://a/", "eose", 2), relay("wss://b/", "eose", 1)],
    };
    expect(nextNewer(page, request)).toEqual({
      paging: "idle",
      ceiling: 1400,
      window: 400,
    });
  });

  it("limit いっぱいに返したリレーがあれば、上限を動かさず窓を狭める", () => {
    // 捕まえる変異: 溢れても上端まで進む（窓の古い側に穴が開く）
    const page = {
      relays: [relay("wss://a/", "eose", 3), relay("wss://b/", "eose", 0)],
    };
    expect(nextNewer(page, request)).toEqual({
      paging: "idle",
      ceiling: 1000,
      window: 100,
    });
  });

  it("1 秒の窓でも溢れるなら、そのまま受け取って進む", () => {
    // 捕まえる変異: 溢れたら必ず狭める（同じ秒に limit 件以上あると進めなくなる）
    const page = { relays: [relay("wss://a/", "eose", 3)] };
    expect(
      nextNewer(page, { since: 1000, until: 1001, limit: 3, now: 5000 }),
    ).toEqual({ paging: "idle", ceiling: 1001, window: 1 });
  });

  it("まばらなら窓を広げる", () => {
    const page = { relays: [relay("wss://a/", "eose", 0)] };
    expect(
      nextNewer(page, { since: 1000, until: 1400, limit: 10, now: 5000 }),
    ).toEqual({ paging: "idle", ceiling: 1400, window: 800 });
  });

  it("今まで取り切ったら追いつく", () => {
    const page = { relays: [relay("wss://a/", "eose", 1)] };
    expect(
      nextNewer(page, { since: 1000, until: 5000, limit: 3, now: 5000 }),
    ).toEqual({ paging: "caught-up", ceiling: 5000 });
  });

  it("今まで取りに行っても、溢れたら追いつかない", () => {
    const page = { relays: [relay("wss://a/", "eose", 3)] };
    expect(
      nextNewer(page, { since: 1000, until: 5000, limit: 3, now: 5000 }),
    ).toMatchObject({ paging: "idle", ceiling: 1000 });
  });

  it("返事をしないリレーがあれば失敗にする", () => {
    // 捕まえる変異: 時間切れを取り切ったとみなす（そのリレーの区間を飛ばす）
    const page = {
      relays: [relay("wss://a/", "eose", 0), relay("wss://b/", "timeout", 0)],
    };
    expect(nextNewer(page, request)).toEqual({ paging: "failed" });
  });

  it("開いているリレーが無ければ失敗にする", () => {
    expect(nextNewer({ relays: [] }, request)).toEqual({ paging: "failed" });
  });
});

describe("estimateWindow", () => {
  it("一覧の密度から 1 ページぶんの幅を見積もる", () => {
    expect(estimateWindow(1000, 50, 50)).toBe(1000);
    expect(estimateWindow(1000, 100, 50)).toBe(500);
  });

  it("見積もれないときは決まった幅", () => {
    expect(estimateWindow(0, 1, 50)).toBe(3600);
  });
});
