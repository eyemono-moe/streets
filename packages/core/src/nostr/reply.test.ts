import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { encodeBech32 } from "./nip19";
import { replyTarget, threadRoot, buildReply, buildReplyTo } from "./reply";
const ID_A = "a".repeat(64);

const ID_B = "b".repeat(64);

const PK = "c".repeat(64);

const noteWith = (
  tags: string[][],
  overrides: Partial<NostrEvent> = {},
): NostrEvent => ({
  id: ID_A,
  pubkey: PK,
  created_at: 1_700_000_000,
  kind: 1,
  tags,
  content: "",
  // isNostrEvent が sig を hex として検証するため、"s" のような非 hex 文字は使えない (embeddedRepostEvent のテストが isNostrEvent を通すため)
  sig: "1".repeat(128),
  ...overrides,
});

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

describe("replyTarget", () => {
  it("reply marker があればそれを返す", () => {
    // 捕まえる変異: root を優先する —— 長いスレッドで「誰への返信か」が常に間違う
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A, "wss://a/", "root", PK],
          ["e", ID_B, "wss://b/", "reply", PK],
        ]),
      ),
    ).toEqual({ form: "id", id: ID_B, relay: "wss://b/", pubkey: PK });
  });

  it("reply が無ければ root を返す", () => {
    // 捕まえる変異: reply marker だけを見る —— NIP-10「ルートへの直接返信は root marker の e タグ 1 本だけ」なので、最も普通の返信が親を持たなくなる
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("印の無い e タグが 1 本なら、それが返信先", () => {
    // 捕まえる変異: 位置形式を読まない（古い書き方の返信が返信として扱われない）
    expect(replyTarget(noteWith([["e", ID_B, "wss://b/"]]))).toEqual({
      form: "id",
      id: ID_B,
      relay: "wss://b/",
    });
  });

  it("印の無い e タグが 2 本以上なら、末尾が返信先", () => {
    // 捕まえる変異: 先頭を返す（根への返信に見え、誰への返信かが変わる）
    const ID_C = "3".repeat(64);
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A],
          ["e", ID_C],
          ["e", ID_B],
        ]),
      )?.id,
    ).toBe(ID_B);
  });

  it("印付きが 1 本でもあれば、印の無いものは位置で読まない", () => {
    // 捕まえる変異: 印の無いもの（言及など）を返信先に混ぜる
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A, "", "root"],
          ["e", ID_B],
        ]),
      )?.id,
    ).toBe(ID_A);
  });

  it("4 番目と 5 番目を取り違えたタグも、位置で読んで返信にする", () => {
    // #787 のイベント。捕まえる変異: 4 番目を印として読み、返信先が無くなる
    expect(
      replyTarget(
        noteWith([
          ["e", ID_A, "", PK, "root"],
          ["e", ID_A, "", PK, "reply"],
          ["p", PK],
        ]),
      ),
    ).toEqual({ form: "id", id: ID_A, pubkey: PK });
  });

  it("mention の印のものは返信先にしない", () => {
    // 捕まえる変異: mention も位置に数える（言及しただけの投稿が返信になる）
    expect(replyTarget(noteWith([["e", ID_B, "", "mention"]]))).toBeUndefined();
  });

  it("本文で引用している投稿は、位置で読んでも返信先にしない", () => {
    // 捕まえる変異: 本文の言及を外さない（引用しただけの投稿が返信になる）
    expect(
      replyTarget(
        noteWith([["e", ID_B]], {
          content: `見て nostr:${encodeBech32("note", ID_B)}`,
        }),
      ),
    ).toBeUndefined();
    expect(
      replyTarget(
        noteWith(
          [
            ["e", ID_A],
            ["e", ID_B],
          ],
          { content: "見て #[1]" },
        ),
      )?.id,
    ).toBe(ID_A);
  });

  it("リポストやリアクションの e タグは位置で読まない", () => {
    // 捕まえる変異: kind を見ずに位置で読む（リポストが返信になり「返信を隠す」で消える）
    expect(replyTarget(noteWith([["e", ID_B]], { kind: 6 }))).toBeUndefined();
    expect(replyTarget(noteWith([["e", ID_B]], { kind: 7 }))).toBeUndefined();
  });

  it("空文字のリレー URL は relay を持たせない", () => {
    // 捕まえる変異: 空文字をそのまま relay に入れる (NIP-10「may be empty string」—— 空文字をヒントとして下流へ渡すと接続先として使われうる)
    expect(replyTarget(noteWith([["e", ID_B, "", "root"]]))).not.toHaveProperty(
      "relay",
    );
  });

  it("pubkey が 64 桁 hex でなければ落とす", () => {
    // 捕まえる変異: 5 番目の要素を検証せずそのまま入れる
    expect(replyTarget(noteWith([["e", ID_B, "", "root", "nope"]]))).toEqual({
      form: "id",
      id: ID_B,
    });
  });

  it("id が 64 桁 hex でなければタグごと落とす", () => {
    // 捕まえる変異: id を検証しない (壊れた id で fetchOnce を撃つ)
    expect(replyTarget(noteWith([["e", "short", "", "root"]]))).toBeUndefined();
  });
});

describe("threadRoot", () => {
  const withTags = (tags: string[][]): NostrEvent =>
    ({
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 1_700_000_000,
      kind: 1,
      tags,
      content: "",
      sig: "c".repeat(128),
    }) as NostrEvent;

  it("root マーカーの e タグを返す", () => {
    // 捕まえる変異: マーカーを見ずに最初の e タグを返す
    expect(
      threadRoot(
        withTags([
          ["e", "1".repeat(64), "", "reply", "9".repeat(64)],
          ["e", "2".repeat(64), "wss://r.example", "root", "8".repeat(64)],
        ]),
      ),
    ).toEqual({
      form: "id",
      id: "2".repeat(64),
      relay: "wss://r.example",
      pubkey: "8".repeat(64),
    });
  });

  it("reply マーカーに引きずられない", () => {
    // 捕まえる変異: replyTarget と同じ「reply があればそれ」の分岐を書く —— 返信への返信で根ではなく親へ購読を張り、祖先が 1 段しか取れなくなる
    expect(
      threadRoot(
        withTags([["e", "1".repeat(64), "", "reply", "9".repeat(64)]]),
      ),
    ).toBeUndefined();
  });

  it("印付きが無ければ、印の無い e タグの先頭を根とする", () => {
    // 捕まえる変異: 位置形式を読まない / 末尾を根にする（親から下しか取れない）
    expect(
      threadRoot(
        withTags([
          ["e", "1".repeat(64)],
          ["e", "2".repeat(64)],
        ]),
      )?.id,
    ).toBe("1".repeat(64));
  });

  it("印付きがあれば、印の無い e タグを根と誤認しない", () => {
    // 捕まえる変異: 印付きがあっても位置で読む（言及した投稿を根とみなす）
    expect(
      threadRoot(
        withTags([
          ["e", "1".repeat(64)],
          ["e", "2".repeat(64), "", "reply"],
        ]),
      ),
    ).toBeUndefined();
  });

  it("root マーカーが無ければ undefined（自分が根）", () => {
    // 捕まえる変異: 見つからないときに自分の id を返す —— 呼び出し側が「自分が根」を判定できなくなる
    expect(threadRoot(withTags([]))).toBeUndefined();
  });

  it("id が 64 桁 hex でなければ落とす", () => {
    // 捕まえる変異: idRef を通さず生の値を返す
    expect(threadRoot(withTags([["e", "zz", "", "root"]]))).toBeUndefined();
  });
});

describe("buildReply", () => {
  it("親が印の無い e タグで書かれていても、先頭の e を根として引き継ぐ", () => {
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [
        ["e", "1".repeat(64), "wss://r.example"],
        ["e", "3".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://r.example", "root"],
      ["e", "2".repeat(64), "wss://a.example", "reply", "9".repeat(64)],
    ]);
  });

  it("p は親の著者を先頭に、親の p を出現順で続ける", () => {
    // 捕まえる変異: 親の p を引き継がない。会話の参加者に通知が行かなくなる。
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["p", "7".repeat(64)],
        ["p", "6".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
      ["p", "6".repeat(64)],
    ]);
  });

  it("p の重複を落とす", () => {
    // 捕まえる変異: 無条件に concat する
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["p", "9".repeat(64)],
        ["p", "7".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
    ]);
  });

  it("relayHint が無ければ位置要素を空文字で埋める", () => {
    // 捕まえる変異: 3 番目を省略して ["e", id, "root", pubkey] にする —— マーカーが relay-url の位置に来て、読む側が「root」というリレーへ接続しようとする
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "", "root", "9".repeat(64)],
    ]);
  });

  it("親の e タグでも root 以外のマーカーは根として使わない", () => {
    // 捕まえる変異: tag[3] === "root" の判定を外して true 化 —— マーカーを見ずに e タグを根扱いすると、返信の親でないイベントが root として引き継がれる
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [
        ["e", "1".repeat(64), "wss://r.example", "mention", "8".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "2".repeat(64), "wss://a.example", "root", "9".repeat(64)],
    ]);
  });

  it("root マーカーが e 以外のタグに付いていても根として使わない", () => {
    // 捕まえる変異: tag[0] === "e" の判定を外す (true 化・|| 化) —— タグ種類を見ず「4 番目が root」だけで拾うと、親の無関係な p タグを根と取り違える
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [["p", "7".repeat(64), "", "root"]],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "2".repeat(64), "wss://a.example", "root", "9".repeat(64)],
    ]);
  });

  it("p 以外のタグや空文字の p タグは通知先として拾わない", () => {
    // 捕まえる変異: tag[0] === "p" のガードを外す (|| 化・true 化) —— e タグの値が p タグの値に紛れ込み、無関係な人物に通知が飛ぶ。空文字の p タグを拾わないことも守る
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["e", "7".repeat(64), "", "mention", "6".repeat(64)],
        ["p", ""],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
    ]);
  });

  it("kind と content をそのまま載せる", () => {
    const draft = buildReply(evt({}), "本文");
    expect(draft.kind).toBe(1);
    expect(draft.content).toBe("本文");
  });

  it("返信本文のハッシュタグを重複なく t タグにし、親の t タグは引き継がない", () => {
    const parent = evt({ tags: [["t", "parent"]] });
    const draft = buildReply(parent, "#Nostr と #東京、もう一度 #nostr");
    expect(draft.tags.filter((tag) => tag[0] === "t")).toEqual([
      ["t", "nostr"],
      ["t", "東京"],
    ]);
  });
});

describe("buildReplyTo", () => {
  it("投稿には kind:1、それ以外にはコメントで返す", () => {
    // 捕まえる変異: 投稿にもコメントで返す（コメントを表示できないクライアントから返信が見えなくなる）/
    // コメントに kind:1 で返す（NIP-10 は kind:1 以外への kind:1 の返信を禁じている）
    expect(buildReplyTo(evt({ kind: 1 }), "hi").kind).toBe(1);
    expect(buildReplyTo(evt({ kind: 1111 }), "hi").kind).toBe(1111);
    expect(buildReplyTo(evt({ kind: 20 }), "hi").kind).toBe(1111);
  });
});

describe("NIP-10 の記述どおり", () => {
  const ROOT = "1".repeat(64);
  const PARENT = "2".repeat(64);
  const MENTION = "3".repeat(64);
  const ROOT_PK = "8".repeat(64);
  const PARENT_PK = "9".repeat(64);
  const hint = "wss://relay.example/";

  it("根への返信は、root の印の e タグを 1 本だけ持つ", () => {
    // NIP-10: "A direct reply to the root of a thread should have a single marked "e" tag of type "root"."
    // 形は `["e", <event-id>, <relay-url>, <marker>, <pubkey>]`
    const root = evt({ id: ROOT, pubkey: ROOT_PK });
    const e = buildReply(root, "hi", { relayHint: hint }).tags.filter(
      (t) => t[0] === "e",
    );
    expect(e).toEqual([["e", ROOT, hint, "root", ROOT_PK]]);
  });

  it("返信への返信は、root と reply の印で根と返信先を指す", () => {
    // NIP-10: "Those marked with "reply" denote the id of the reply event being responded to.
    // Those marked with "root" denote the root id of the reply thread being responded to."
    const parent = evt({
      id: PARENT,
      pubkey: PARENT_PK,
      tags: [["e", ROOT, hint, "root", ROOT_PK]],
    });
    const e = buildReply(parent, "hi", { relayHint: hint }).tags.filter(
      (t) => t[0] === "e",
    );
    expect(e).toEqual([
      ["e", ROOT, hint, "root", ROOT_PK],
      ["e", PARENT, hint, "reply", PARENT_PK],
    ]);
  });

  it("p タグには、親の p タグをすべてと親の作者を入れる", () => {
    // NIP-10: "When replying to a text event E the reply event's "p" tags should contain all of
    // E's "p" tags as well as the "pubkey" of the event being replied to."
    const parent = evt({
      id: PARENT,
      pubkey: PARENT_PK,
      tags: [["p", ROOT_PK]],
    });
    const p = buildReply(parent, "hi").tags.filter((t) => t[0] === "p");
    expect(new Set(p.map((t) => t[1]))).toEqual(new Set([PARENT_PK, ROOT_PK]));
  });

  it("投稿以外への返信は kind:1 で書かない", () => {
    // NIP-10: "Kind 1 replies MUST NOT be used to reply to other kinds, use NIP-22 instead."
    const article = evt({ id: PARENT, kind: 30023, tags: [["d", "x"]] });
    expect(buildReplyTo(article, "hi").kind).toBe(1111);
  });

  it("位置の書き方で e タグが 1 本なら、それが返信先", () => {
    // NIP-10: "One "e" tag: `["e", <id>]`: The id of the event to which this event is a reply."
    const reply = noteWith([["e", PARENT]]);
    expect(replyTarget(reply)?.id).toBe(PARENT);
    expect(threadRoot(reply)?.id).toBe(PARENT);
  });

  it("位置の書き方で e タグが 2 本なら、先頭が根で末尾が返信先", () => {
    // NIP-10: "Two "e" tags: `["e", <root-id>]`, `["e", <reply-id>]`"
    const reply = noteWith([
      ["e", ROOT],
      ["e", PARENT],
    ]);
    expect(threadRoot(reply)?.id).toBe(ROOT);
    expect(replyTarget(reply)?.id).toBe(PARENT);
  });

  it("位置の書き方で e タグが 3 本以上なら、間のものは言及で、末尾が返信先", () => {
    // NIP-10: "Many "e" tags: `["e", <root-id>]` `["e", <mention-id>]`, ..., `["e", <reply-id>]`"
    const reply = noteWith([
      ["e", ROOT],
      ["e", MENTION],
      ["e", PARENT],
    ]);
    expect(threadRoot(reply)?.id).toBe(ROOT);
    expect(replyTarget(reply)?.id).toBe(PARENT);
  });

  it("印付きの e タグからは、5 番目を作者として読む", () => {
    // NIP-10: `["e", <event-id>, <relay-url>, <marker>, <pubkey>]`
    expect(
      replyTarget(noteWith([["e", PARENT, hint, "reply", PARENT_PK]])),
    ).toEqual({ form: "id", id: PARENT, relay: hint, pubkey: PARENT_PK });
  });
});
