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
    // 捕まえる変異: アクセサを即時評価して渡す (`literal` 列も warmUpRouting の再購読に巻き込まれる退行)。
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

  it("ユーザー詳細は投稿とリポストを対象ユーザーから集める", () => {
    // 捕まえる変異: kind:6 または対象 pubkey を落とし、表示範囲を狭める。
    expect(
      resolveSource({ kind: "user", pubkey: "a".repeat(64) }, ctx()),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6], authors: ["a".repeat(64)] }],
    });
  });

  it("フォロー中一覧は対象ユーザーの最新版 kind:3 を集める", () => {
    // 捕まえる変異: viewer の kind:3 を読む / limit を落として旧版まで集める。
    expect(
      resolveSource({ kind: "followees-list", pubkey: "a".repeat(64) }, ctx()),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [3], authors: ["a".repeat(64)], limit: 1 }],
    });
  });

  it("フォロワー一覧は対象ユーザーを指す kind:3 を逆引きする", () => {
    // 捕まえる変異: authors フィルタにして対象本人の kind:3 だけを読む。
    expect(
      resolveSource({ kind: "followers-list", pubkey: "a".repeat(64) }, ctx()),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [3], "#p": ["a".repeat(64)] }],
    });
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
    // 捕まえる変異: 分岐の外で `relayList()` を呼ぶ (動作は変わらず他のテストは落ちないが、`literal` 列が再購読に巻き込まれる)。
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
