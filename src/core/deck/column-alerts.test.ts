import { describe, expect, it } from "vitest";
import type { SectionStatus } from "../read/source";
import { columnAlerts } from "./column-alerts";
import type { ColumnDef } from "./deck";

const status = (incomplete?: SectionStatus["incomplete"]): SectionStatus => ({
  phase: "settled",
  ...(incomplete ? { incomplete } : {}),
});

const explicit: ColumnDef = {
  id: "a",
  title: "a",
  source: { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
};

const routed: ColumnDef = {
  id: "b",
  title: "b",
  source: { kind: "followees", kinds: [1] },
};

const notifications: ColumnDef = {
  id: "c",
  title: "通知",
  source: { kind: "notifications" },
};

describe("columnAlerts", () => {
  it("明示リレーが到達不能なら 1 件返す", () => {
    // 捕まえる変異: unreachableRelays ではなく別のフィールド
    // (unroutableAuthors など) を見る。0 を 1 に固定するような雑な変異では
    // 他のテストの副作用でしか落ちないので、フィールド取り違えで検証した
    // (検証済み)
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 1,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        { viewerRelayListMissing: false },
      ),
    ).toHaveLength(1);
  });

  it("Outbox が選んだリレーが到達不能でも 0 件", () => {
    // 捕まえる変異: source の種類を見ずに unreachableRelays だけで判定する。
    // ADR-0026: ユーザーはどのリレーが選ばれたかを指定していないし変え
    // られない —— 行動できない以上これは診断値であって異常表示ではない。
    expect(
      columnAlerts(
        routed,
        status({
          unreachableRelays: 3,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        { viewerRelayListMissing: false },
      ),
    ).toEqual([]);
  });

  it("uncoveredAuthors だけでは 0 件", () => {
    // 捕まえる変異: incomplete が立っていれば何でも alert にする
    // (接続予算の超過はユーザーが行動できない)
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 0,
          unroutableAuthors: 0,
          uncoveredAuthors: 12,
        }),
        { viewerRelayListMissing: false },
      ),
    ).toEqual([]);
  });

  it("incomplete が無ければ 0 件", () => {
    // 捕まえる変異: incomplete を undefined のまま数値として読む
    expect(columnAlerts(explicit, status(), { viewerRelayListMissing: false })).toEqual([]);
  });

  it("literal でも relays を指定していなければ 0 件", () => {
    // 捕まえる変異: literal かどうかだけを見て relays の有無を見ない。
    // relays を持たない literal は Outbox に任せているので、上の
    // 「Outbox が選んだリレー」と同じく行動できない。
    const routedLiteral: ColumnDef = {
      id: "d",
      title: "d",
      source: { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
    };
    expect(
      columnAlerts(
        routedLiteral,
        status({
          unreachableRelays: 2,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        { viewerRelayListMissing: false },
      ),
    ).toEqual([]);
  });

  it("通知列で自分のリレー設定が無ければ知らせる", () => {
    // 捕まえる変異: この警告を出さない。通知が来ないとき、誰も反応して
    // いないのか自分の kind:10002 が無くて fallback を見ているのか、
    // 画面からは区別が付かない (ADR-0011: 劣化を隠さない)。
    expect(
      columnAlerts(notifications, status(), { viewerRelayListMissing: true }),
    ).toHaveLength(1);
  });

  it("リレー設定が引けていれば知らせない", () => {
    // 捕まえる変異: context を見ずに常に出す (通知列を出した全員に
    // 意味の無い警告が付く)
    expect(
      columnAlerts(notifications, status(), { viewerRelayListMissing: false }),
    ).toEqual([]);
  });

  it("通知以外の列では出さない", () => {
    // 捕まえる変異: source.kind を見ない。ホーム列や明示リレー列は
    // 自分の kind:10002 を必要としないので、そこに出しても
    // ADR-0026 の「ユーザーが行動できるもの」にならない。
    expect(
      columnAlerts(routed, status(), { viewerRelayListMissing: true }),
    ).toEqual([]);
    expect(
      columnAlerts(explicit, status(), { viewerRelayListMissing: true }),
    ).toEqual([]);
  });
});
