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

const settled = { relayListSettled: true, readRelayCount: 0 };
const hasRelays = { relayListSettled: true, readRelayCount: 3 };
const notSettled = { relayListSettled: false, readRelayCount: 0 };

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
        hasRelays,
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
        hasRelays,
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
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("incomplete が無ければ 0 件", () => {
    // 捕まえる変異: incomplete を undefined のまま数値として読む
    expect(columnAlerts(explicit, status(), hasRelays)).toEqual([]);
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
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("通知列で自分のリレー設定が無ければ知らせる", () => {
    // 捕まえる変異: この警告を出さない。通知が来ないとき、誰も反応して
    // いないのか自分の kind:10002 が無くて fallback を見ているのか、
    // 画面からは区別が付かない (ADR-0011: 劣化を隠さない)。
    const alerts = columnAlerts(notifications, status(), settled);
    expect(alerts).toHaveLength(1);
    // 捕まえる変異: 警告の種類が別のもの (到達不能など) へ差し替わる。
    // 文言全体は主張しない —— タイプミスしか捕まらず、変更のたびに壊れる。
    expect(alerts[0]?.message).toContain("kind:10002");
  });

  it("リレー設定が引けていれば知らせない", () => {
    // 捕まえる変異: context を見ずに常に出す (通知列を出した全員に
    // 意味の無い警告が付く)
    expect(columnAlerts(notifications, status(), hasRelays)).toEqual([]);
  });

  it("通知以外の列では出さない", () => {
    // 捕まえる変異: source.kind を見ない。ホーム列や明示リレー列は
    // 自分の kind:10002 を必要としないので、そこに出しても
    // ADR-0026 の「ユーザーが行動できるもの」にならない。
    expect(columnAlerts(routed, status(), settled)).toEqual([]);
    expect(columnAlerts(explicit, status(), settled)).toEqual([]);
  });

  it("settle 前は readRelayCount が 0 でも出さない", () => {
    // 捕まえる変異: `relayListSettled` のゲートを外し `readRelayCount === 0`
    // だけで判定する。ウォームアップがまだ届いていないだけの起動直後を
    // 「設定が無い」と確定させてしまう —— まだ存在しない劣化を確定した
    // 事実として見せることになる (これが今回いちばん守りたい 1 行)。
    expect(columnAlerts(notifications, status(), notSettled)).toEqual([]);
  });

  it("通知列は read リレーが到達不能なら知らせる", () => {
    // 捕まえる変異: この警告を出さない。通知カラムは `literal` ではない
    // ので、`source.kind === "literal"` だけを見る既存の分岐には引っかから
    // ず、read リレーが全滅していても黙ってしまう。画面から見える結果
    // (通知が来ない) も取れる行動 (リレー設定を直す) も
    // `viewerRelayListMissing` のときと同じなので、両方知らせる。
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
    // 捕まえる変異: source.kind を見ずに unreachableRelays だけで判定する
    // (routed 列は既に別のテストで到達不能 0 件を確認済みだが、ここでは
    // 通知向けの新しい分岐が routed に漏れ出していないかを確かめる)
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
});
