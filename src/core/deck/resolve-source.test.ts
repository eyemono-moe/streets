import { describe, expect, it, vi } from "vitest";
import { resolveSource } from "./resolve-source";

describe("resolveSource", () => {
  it("literal は filters をそのまま渡す", () => {
    // 捕まえる変異: literal のときも followees 側の分岐を通す
    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
        { followees: () => ["zzz"] },
      ),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: ["abc"] }] });
  });

  it("literal の relays は指定があるときだけ載る", () => {
    // 捕まえる変異: relays を無条件に展開する (`relays: undefined` という
    // キーが生え、`NostrSource.relays !== undefined` を見ている
    // subscription-manager の明示リレー判定が、Outbox に任せたいカラムを
    // 「リレー 0 本の明示指定」として扱ってしまう)
    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1] }] },
        { followees: () => [] },
      ),
    ).not.toHaveProperty("relays");

    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
        { followees: () => [] },
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a/"],
    });
  });

  it("followees は context のフォローリストを展開する", () => {
    // 捕まえる変異: context を無視して authors を空にする
    // (ホーム列が永久に空になる)
    expect(
      resolveSource(
        { kind: "followees", kinds: [1] },
        { followees: () => ["a", "b"] },
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], authors: ["a", "b"] }],
    });
  });

  it("フォロー 0 人でも authors を落とさない", () => {
    // 捕まえる変異: 空のときは authors を付けない
    // (`{ kinds: [1] }` は「誰の投稿でもよい」= firehose。フォロー 0 人の
    // 新規ユーザーのホーム列が、本物のリレーへの無制限購読になる)
    expect(
      resolveSource({ kind: "followees", kinds: [1] }, { followees: () => [] }),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: [] }] });
  });

  it("context のフォローリストを共有しない", () => {
    // 捕まえる変異: `authors: context.followees()` の戻り値をそのまま
    // 参照で渡す (呼び出し側が後で配列を破壊的に変更すると、既に作った
    // NostrSource の中身が黙って変わる)
    const followees = ["a"];
    const resolved = resolveSource(
      { kind: "followees", kinds: [1] },
      { followees: () => followees },
    );
    followees.push("b");
    expect(resolved.filters[0].authors).toEqual(["a"]);
  });

  it("literal では followees アクセサを呼ばない", () => {
    // 捕まえる変異: `resolveSource(source, { followees: props.followees() })`
    // のように呼び出し側がアクセサを即時評価して渡す退行 (最終レビュー
    // Important 1)。`literal` の分岐はアクセサを一切呼ばない契約 —— ここが
    // 破れると、呼び出し側 (DeckColumn.tsx の `createMemo`) の引数評価の
    // 時点で `props.followees()` を呼ばざるを得なくなり、`literal` 列の
    // `source` memo までもが `warmUpRouting` の結果 (フォローリストの
    // リソース) を追跡してしまう。結果、ウォームアップが settle する
    // たびに `literal` 列も含む全カラムが再購読される (`createSection` の
    // `createEffect` が古い `SectionReader` を破棄して新しいものを作る)。
    const followees = vi.fn(() => ["zzz"]);
    resolveSource(
      { kind: "literal", filters: [{ kinds: [1] }] },
      { followees },
    );
    expect(followees).not.toHaveBeenCalled();
  });

  it("followees では followees アクセサを呼ぶ", () => {
    // 捕まえる変異: kind === "followees" でもアクセサを呼ばずに固定値
    // (例えば空配列) を使う退行。これが起きるとホーム列が最新のフォロー
    // リストを反映しなくなる
    const followees = vi.fn(() => ["a"]);
    resolveSource({ kind: "followees", kinds: [1] }, { followees });
    expect(followees).toHaveBeenCalled();
  });
});
