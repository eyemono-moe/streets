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

const missing = { phase: "missing" } as const;
const hasRelays = {
  phase: "ready",
  entries: [
    { url: "wss://one/" as const, read: true, write: true },
    { url: "wss://two/" as const, read: true, write: false },
  ],
} as const;
const loading = { phase: "loading" } as const;

describe("columnAlerts", () => {
  it("明示リレーが到達不能なら 1 件返す", () => {
    // 捕まえる変異: unreachableRelays 以外のフィールド (unroutableAuthors など) を見る。
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 1,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toHaveLength(1);
  });

  it("Outbox が選んだリレーが到達不能でも 0 件", () => {
    // 捕まえる変異: source の種類を見ず判定する —— ユーザーが変えられないリレーは診断値扱い。
    expect(
      columnAlerts(
        routed,
        status({
          unreachableRelays: 3,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("uncoveredAuthors だけでは 0 件", () => {
    // 捕まえる変異: incomplete が立っていれば何でも alert にする (接続予算超過は行動できない)。
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 0,
          unroutableAuthors: 0,
          uncoveredAuthors: 12,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("incomplete が無ければ 0 件", () => {
    // 捕まえる変異: incomplete を undefined のまま数値として読む
    expect(columnAlerts(explicit, status(), hasRelays)).toEqual([]);
  });

  it("literal でも relays を指定していなければ 0 件", () => {
    // 捕まえる変異: literal かどうかだけを見て relays の有無を見ない (relays 無しは Outbox 任せ)。
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
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("通知列で自分のリレー設定が無ければ知らせる", () => {
    // 捕まえる変異: この警告を出さない (無反応か kind:10002 欠如か、画面からは区別できない)。
    const alerts = columnAlerts(notifications, status(), missing);
    expect(alerts).toHaveLength(1);
    // 捕まえる変異: 警告の種類が差し替わる。文言全体は主張しない (タイプミスでしか壊れないようにする)。
    expect(alerts[0]?.message).toContain("kind:10002");
  });

  it("リレー設定が引けていれば知らせない", () => {
    // 捕まえる変異: context を見ずに常に出す。
    expect(columnAlerts(notifications, status(), hasRelays)).toEqual([]);
  });

  it("通知以外の列では出さない", () => {
    // 捕まえる変異: source.kind を見ない (ホーム/明示リレー列は kind:10002 を必要としない)。
    expect(columnAlerts(routed, status(), missing)).toEqual([]);
    expect(columnAlerts(explicit, status(), missing)).toEqual([]);
  });

  it("settle 前は readRelayCount が 0 でも出さない", () => {
    // 捕まえる変異: ゲートを外す (起動直後の未着信を「設定無し」と確定させてしまう)。
    expect(columnAlerts(notifications, status(), loading)).toEqual([]);
  });

  it("通知列は read リレーが到達不能なら知らせる", () => {
    // 捕まえる変異: この警告を出さない (`literal` 用の分岐には引っかからず黙ってしまう)。
    const alerts = columnAlerts(
      notifications,
      status({
        unreachableRelays: 2,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      }),
      hasRelays,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.action).toContain("read リレー");
  });

  it("通知列以外では read リレーの到達不能を出さない", () => {
    // 捕まえる変異: source.kind を見ない (通知向け分岐が routed へ漏れていないか確認)。
    expect(
      columnAlerts(
        routed,
        status({
          unreachableRelays: 2,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("fallback が不通でもユーザー設定の不通とは表示しない", () => {
    // 捕まえる変異: ゲートしない (fallback の不通とユーザー設定の不通を混同する)。
    const alerts = columnAlerts(
      notifications,
      status({
        unreachableRelays: 3,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      }),
      missing,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).not.toContain("あなたの設定した read リレー");
  });
});
