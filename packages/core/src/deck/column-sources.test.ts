import { describe, expect, it } from "vite-plus/test";
import { FALLBACK_RELAYS } from "../read/default-relays";
import {
  activitySource,
  channelMessagesSource,
  channelSource,
  channelsSource,
  chatModerationSource,
  bookmarksSource,
  followListSource,
  followeesSource,
  followersSource,
  literalSource,
  notificationsSource,
  searchSource,
  userPostsSource,
  userReactionsSource,
} from "./column-sources";

const VIEWER = "f".repeat(64);

describe("literalSource", () => {
  it("filters をそのまま渡す", () => {
    expect(
      literalSource({
        kind: "literal",
        filters: [{ kinds: [1], authors: ["abc"] }],
      }),
    ).toEqual({ type: "nostr", filters: [{ kinds: [1], authors: ["abc"] }] });
  });

  it("relays は指定があるときだけ載る", () => {
    // 捕まえる変異: relays を無条件に展開する (`relays: undefined` という
    // キーが生え、`NostrSource.relays !== undefined` を見ている
    // subscription-manager の明示リレー判定が、Outbox に任せたいカラムを
    // 「リレー 0 本の明示指定」として扱ってしまう)
    expect(
      literalSource({ kind: "literal", filters: [{ kinds: [1] }] }),
    ).not.toHaveProperty("relays");

    expect(
      literalSource({
        kind: "literal",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      }),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1] }],
      relays: ["wss://a/"],
    });
  });
});

describe("followeesSource", () => {
  it("フォローリストを展開する", () => {
    // 捕まえる変異: authors を空にする (ホーム列が永久に空になる)
    expect(followeesSource([1], ["a", "b"], VIEWER)).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], authors: ["a", "b", VIEWER] }],
    });
  });

  it("自分をフォローしていなくても自分を含め、重ねない", () => {
    // 捕まえる変異: フォロー一覧だけを authors にする (自分の投稿がホームに
    // 出ない) / 自己フォローのとき自分を 2 回入れる
    expect(
      followeesSource([1], ["a", VIEWER], VIEWER).filters[0].authors,
    ).toEqual(["a", VIEWER]);
  });

  it("フォロー 0 人でも authors を落とさない", () => {
    // 捕まえる変異: 空のときは authors を付けない
    // (`{ kinds: [1] }` は「誰の投稿でもよい」= firehose。フォロー 0 人の
    // 新規ユーザーのホーム列が、本物のリレーへの無制限購読になる)
    expect(followeesSource([1], [], VIEWER)).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], authors: [VIEWER] }],
    });
  });

  it("渡したフォローリストを共有しない", () => {
    // 捕まえる変異: 配列を参照のまま渡す (呼び出し側が後で配列を破壊的に
    // 変更すると、既に作った NostrSource の中身が黙って変わる)
    const followees = ["a"];
    const resolved = followeesSource([1], followees, VIEWER);
    followees.push("b");
    expect(resolved.filters[0].authors).toEqual(["a", VIEWER]);
  });
});

describe("人と投稿", () => {
  it("ユーザーの投稿は投稿とリポストを対象ユーザーから集める", () => {
    // 捕まえる変異: kind:6 または対象 pubkey を落とし、表示範囲を狭める。
    expect(userPostsSource("a".repeat(64))).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6], authors: ["a".repeat(64)] }],
    });
  });

  it("ユーザーのリアクションは対象ユーザーの kind:7 を集める", () => {
    expect(userReactionsSource("a".repeat(64))).toEqual({
      type: "nostr",
      filters: [{ kinds: [7], authors: ["a".repeat(64)] }],
    });
  });

  it("フォロー中一覧は対象ユーザーの最新版 kind:3 を集める", () => {
    // 捕まえる変異: limit を落として旧版まで集める。
    expect(followListSource("a".repeat(64))).toEqual({
      type: "nostr",
      filters: [{ kinds: [3], authors: ["a".repeat(64)], limit: 1 }],
    });
  });

  it("フォロワー一覧は対象ユーザーを指す kind:3 を逆引きする", () => {
    // 捕まえる変異: authors フィルタにして対象本人の kind:3 だけを読む。
    expect(followersSource("a".repeat(64))).toEqual({
      type: "nostr",
      filters: [{ kinds: [3], "#p": ["a".repeat(64)] }],
    });
  });

  it("activity は e と q の両方で対象イベントを逆引きする", () => {
    const target = "b".repeat(64);
    expect(activitySource(target)).toEqual({
      type: "nostr",
      filters: [
        { kinds: [6, 7, 16], "#e": [target] },
        { kinds: [1], "#q": [target] },
      ],
    });
  });
});

describe("notificationsSource", () => {
  it("自分宛を read リレーで待つ", () => {
    // 捕まえる変異: `#p` に viewer ではなく空配列を入れる (誰にもマッチ
    // しないカラムになる) / kinds を [1] だけにする (リアクションと
    // リポストの通知が丸ごと消える)
    expect(
      notificationsSource(VIEWER, {
        phase: "ready",
        entries: [{ url: "wss://inbox/", read: true, write: false }],
      }),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7, 9735], "#p": [VIEWER] }],
      relays: ["wss://inbox/"],
    });
  });

  it("read リレーが 0 本なら fallback へ落とす", () => {
    // 捕まえる変異: `relays: []` をそのまま載せる。空配列は
    // 「リレー 0 本の明示指定」として扱われるので、通知が永久に来ない
    // カラムが黙って出来上がる (`authors: []` と同じ罠)。
    expect(notificationsSource(VIEWER, { phase: "missing" })).toEqual({
      type: "nostr",
      filters: [{ kinds: [1, 6, 7, 9735], "#p": [VIEWER] }],
      relays: [...FALLBACK_RELAYS],
    });
  });

  it("リレーリストの取得中は、まだ購読しない", () => {
    // 捕まえる変異: loading と missing をどちらも read リレー 0 本として
    // fallback へ落とす。起動のたびに外部 3 本へ一瞬購読してから本来の
    // inbox へ張り直す挙動が戻る。
    expect(notificationsSource(VIEWER, { phase: "loading" })).toBeUndefined();
    expect(
      notificationsSource(VIEWER, { phase: "signed-out" }),
    ).toBeUndefined();
  });

  it("取得済みでも read リレーが無ければ fallback へ落とす", () => {
    // 捕まえる変異: kind:10002 が存在することだけを見て空配列を素通しする。
    expect(
      notificationsSource(VIEWER, {
        phase: "ready",
        entries: [{ url: "wss://outbox/", read: false, write: true }],
      }),
    ).toMatchObject({ relays: [...FALLBACK_RELAYS] });
  });
});

describe("bookmarksSource", () => {
  it("今のブックマークを ids にする", () => {
    expect(bookmarksSource(["a", "b"])).toEqual({
      type: "nostr",
      filters: [{ ids: ["a", "b"] }],
    });
  });

  it("ブックマークが 0 件でも ids を落とさない", () => {
    // 捕まえる変異: 空なら ids を省く（NIP-01 では「誰の何でもよい」になる）
    expect(bookmarksSource([])).toEqual({
      type: "nostr",
      filters: [{ ids: [] }],
    });
  });
});

describe("searchSource", () => {
  it("書いた条件を NIP-50 の問い合わせに直し、検索リレーへ送る", () => {
    // 捕まえる変異: 検索リレーを無視して Outbox に任せる（著者が無いので
    // どこへも届かない）／条件を素通しする
    expect(
      searchSource("ねこ #nostr kind:1", ["wss://search.example/"]),
    ).toEqual({
      type: "nostr",
      filters: [{ kinds: [1], search: "ねこ", "#t": ["nostr"] }],
      relays: ["wss://search.example/"],
    });
  });
});

describe("チャンネル", () => {
  const CHANNEL = "1".repeat(64);
  const RELAYS = ["wss://yabu.me/" as const];

  it("リレーが 1 本も分からないうちは購読しない", () => {
    // 捕まえる変異: relays: [] を載せる（0 本の明示指定になり、何も届かないまま終わる）
    expect(channelMessagesSource(CHANNEL, [])).toBeUndefined();
    expect(channelSource(CHANNEL, [])).toBeUndefined();
  });

  it("発言はチャンネルを #e で指すものを、チャンネルのリレーから取る", () => {
    expect(channelMessagesSource(CHANNEL, RELAYS)).toEqual({
      type: "nostr",
      filters: [{ kinds: [42], "#e": [CHANNEL] }],
      relays: ["wss://yabu.me/"],
    });
  });

  it("ミュートは、並んでいる発言によらない条件で取る", () => {
    // 捕まえる変異: 発言の id を条件に入れる（発言が届くたびに購読を張り直す）
    expect(chatModerationSource(RELAYS)?.filters).toEqual([
      { kinds: [43, 44], limit: 500 },
    ]);
  });

  it("チャンネルの id が無ければ情報を取りにいかない", () => {
    // 捕まえる変異: ids: [] で購読する（該当なしの購読が張られる）
    expect(channelsSource([], RELAYS)).toBeUndefined();
  });
});
