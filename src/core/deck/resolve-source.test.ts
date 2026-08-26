import { describe, expect, it, vi } from "vitest";
import { FALLBACK_RELAYS } from "../read/default-relays";
import { type ResolveContext, resolveSource } from "./resolve-source";

const VIEWER = "f".repeat(64);

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  followees: () => [],
  viewer: VIEWER,
  relayList: () => ({ phase: "missing" }),
  ...over,
});

describe("resolveSource", () => {
  it("literal は filters をそのまま渡す", () => {
    // 捕まえる変異: literal のときも followees 側の分岐を通す
    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
        ctx({ followees: () => ["zzz"] }),
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
        ctx({ followees: () => [] }),
      ),
    ).not.toHaveProperty("relays");

    expect(
      resolveSource(
        { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
        ctx({ followees: () => [] }),
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
        ctx({ followees: () => ["a", "b"] }),
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
      resolveSource(
        { kind: "followees", kinds: [1] },
        ctx({ followees: () => [] }),
      ),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: [] }] });
  });

  it("context のフォローリストを共有しない", () => {
    // 捕まえる変異: `authors: context.followees()` の戻り値をそのまま
    // 参照で渡す (呼び出し側が後で配列を破壊的に変更すると、既に作った
    // NostrSource の中身が黙って変わる)
    const followees = ["a"];
    const resolved = resolveSource(
      { kind: "followees", kinds: [1] },
      ctx({ followees: () => followees }),
    );
    followees.push("b");
    expect(resolved.filters[0].authors).toEqual(["a"]);
  });

  it("literal では followees アクセサを呼ばない", () => {
    // 捕まえる変異: `resolveSource(source, { followees: props.followees() })`
    // のように呼び出し側がアクセサを即時評価して渡す退行。
    // `literal` の分岐はアクセサを一切呼ばない契約 —— ここが
    // 破れると、呼び出し側 (DeckColumn.tsx の `createMemo`) の引数評価の
    // 時点で `props.followees()` を呼ばざるを得なくなり、`literal` 列の
    // `source` memo までもが `warmUpRouting` の結果 (フォローリストの
    // リソース) を追跡してしまう。結果、ウォームアップが settle する
    // たびに `literal` 列も含む全カラムが再購読される (`createSection` の
    // `createEffect` が古い `SectionReader` を破棄して新しいものを作る)。
    const followees = vi.fn(() => ["zzz"]);
    resolveSource(
      { kind: "literal", filters: [{ kinds: [1] }] },
      ctx({ followees }),
    );
    expect(followees).not.toHaveBeenCalled();
  });

  it("followees では followees アクセサを呼ぶ", () => {
    // 捕まえる変異: kind === "followees" でもアクセサを呼ばずに固定値
    // (例えば空配列) を使う退行。これが起きるとホーム列が最新のフォロー
    // リストを反映しなくなる
    const followees = vi.fn(() => ["a"]);
    resolveSource({ kind: "followees", kinds: [1] }, ctx({ followees }));
    expect(followees).toHaveBeenCalled();
  });

  it("notifications は自分宛を read リレーで待つ", () => {
    // 捕まえる変異: `#p` に viewer ではなく空配列を入れる (誰にもマッチ
    // しないカラムになる) / kinds を [1] だけにする (リアクションと
    // リポストの通知が丸ごと消える)
    expect(
      resolveSource(
        { kind: "notifications" },
        ctx({
          relayList: () => ({
            phase: "ready",
            entries: [{ url: "wss://inbox/", read: true, write: false }],
          }),
        }),
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7], "#p": [VIEWER] }],
      relays: ["wss://inbox/"],
    });
  });

  it("read リレーが 0 本なら fallback へ落とす", () => {
    // 捕まえる変異: `relays: []` をそのまま載せる。空配列は
    // 「リレー 0 本の明示指定」として扱われるので、通知が永久に来ない
    // カラムが黙って出来上がる (`authors: []` と同じ罠)。
    expect(
      resolveSource(
        { kind: "notifications" },
        ctx({ relayList: () => ({ phase: "missing" }) }),
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7], "#p": [VIEWER] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("relayList は notifications の分岐でだけ呼ばれる", () => {
    // 捕まえる変異: 分岐の外 (関数の先頭など) で `context.relayList()` を
    // 呼ぶ。**動作としては正しいままなので、他のどのテストも落ちない** ——
    // 落ちるのは実行時の挙動で、`literal` 列の source memo が warmUp の
    // リソースを依存として記録し、ウォームアップが settle するたびに
    // 全カラムの SectionReader が破棄・再作成される。同型の事故が
    // `followees` で一度起きている (resolve-source.ts のコメント参照)。
    const relayList = vi.fn(() => ({ phase: "missing" }) as const);

    resolveSource(
      { kind: "literal", filters: [{ kinds: [1] }] },
      ctx({ relayList }),
    );
    expect(relayList).not.toHaveBeenCalled();

    resolveSource({ kind: "followees", kinds: [1] }, ctx({ relayList }));
    expect(relayList).not.toHaveBeenCalled();

    resolveSource({ kind: "notifications" }, ctx({ relayList }));
    expect(relayList).toHaveBeenCalledTimes(1);
  });

  it("リレーリストの取得中は fallback へ購読しない", () => {
    // 捕まえる変異: loading と missing をどちらも read リレー 0 本として
    // fallback へ落とす。起動のたびに外部 3 本へ一瞬購読してから本来の
    // inbox へ張り直す挙動が戻る。
    expect(
      resolveSource(
        { kind: "notifications" },
        ctx({ relayList: () => ({ phase: "loading" }) }),
      ),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7], "#p": [VIEWER] }],
      relays: [],
    });
  });

  it("取得済みでも read リレーが無ければ fallback へ落とす", () => {
    // 捕まえる変異: kind:10002 が存在することだけを見て空配列を素通しする。
    expect(
      resolveSource(
        { kind: "notifications" },
        ctx({
          relayList: () => ({
            phase: "ready",
            entries: [{ url: "wss://outbox/", read: false, write: true }],
          }),
        }),
      ),
    ).toMatchObject({ relays: [...FALLBACK_RELAYS] });
  });
});
