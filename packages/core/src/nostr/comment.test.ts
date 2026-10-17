import { describe, expect, it } from "vite-plus/test";
import { commentRefs, buildComment } from "./comment";
import type { NostrEvent } from "./event";
import { eventRelayHints } from "./event-refs";
import { isReply, replyTarget, threadRoot } from "./reply";
const ID_A = "a".repeat(64);

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

describe("NIP-22 のコメント", () => {
  const ROOT = "1".repeat(64);
  const PARENT = "2".repeat(64);
  const ROOT_PK = "8".repeat(64);
  const PARENT_PK = "9".repeat(64);
  const comment = (tags: string[][]) => noteWith(tags, { kind: 1111 });
  // Amethyst が kind:1 の起点に付いたコメントへ返信するときの形
  const nested = comment([
    ["E", ROOT, "wss://root.example/", ROOT_PK],
    ["K", "1"],
    ["P", ROOT_PK],
    ["e", PARENT, "wss://parent.example/", PARENT_PK],
    ["k", "1111"],
    ["p", PARENT_PK],
  ]);

  it("親は小文字の e、根は大文字の E から取る", () => {
    // 捕まえる変異: コメントにも NIP-10 の marker を求める（コメントの 4 番目は pubkey なので何も取れない）
    expect(replyTarget(nested)).toEqual({
      form: "id",
      id: PARENT,
      relay: "wss://parent.example/",
      pubkey: PARENT_PK,
    });
    // 捕まえる変異: 根も小文字の e から取る（返信への返信のスレッドで根を見失う）
    expect(threadRoot(nested)?.id).toBe(ROOT);
  });

  it("kind:1 の大文字の E を根と読まない", () => {
    // 捕まえる変異: kind を見ずに E を読む —— NIP-10 の返信にとって E は意味を持たない
    expect(threadRoot(noteWith([["E", ROOT, "", ROOT_PK]]))).toBeUndefined();
  });

  it("根と親を、指す先の kind と一緒に返す", () => {
    expect(commentRefs(nested)).toEqual({
      root: {
        form: "id",
        id: ROOT,
        relay: "wss://root.example/",
        pubkey: ROOT_PK,
        kind: 1,
      },
      parent: {
        form: "id",
        id: PARENT,
        relay: "wss://parent.example/",
        pubkey: PARENT_PK,
        kind: 1111,
      },
    });
  });

  it("記事のように A と E を両方持つ先はアドレスを採る", () => {
    // 捕まえる変異: E を先に見る —— 記事を書き直すと別の id になり、コメントが記事から外れる
    const address = `30023:${ROOT_PK}:post`;
    const refs = commentRefs(
      comment([
        ["A", address, "wss://a.example/"],
        ["E", ROOT, "", ROOT_PK],
        ["K", "30023"],
        ["a", address],
        ["e", ROOT, "", ROOT_PK],
        ["k", "30023"],
      ]),
    );
    expect(refs?.root).toEqual({
      form: "address",
      address,
      relay: "wss://a.example/",
      kind: 30023,
    });
  });

  it("住所を持つ親は、版の id を添えていても id として返さない", () => {
    // 捕まえる変異: 小文字の e を先に見る —— NIP-22 の例どおりの記事へのコメントで、
    // 記事の古い版の id を親とみなし、スレッドの上が欠けて見える
    const address = `30023:${ROOT_PK}:post`;
    const onArticle = comment([
      ["A", address],
      ["K", "30023"],
      ["a", address],
      ["e", ROOT],
      ["k", "30023"],
    ]);
    expect(replyTarget(onArticle)).toBeUndefined();
    expect(threadRoot(onArticle)).toBeUndefined();
    expect(isReply(onArticle)).toBe(true);
  });

  it("外部の識別子（NIP-73）を文字列の kind と一緒に返す", () => {
    const refs = commentRefs(
      comment([
        ["I", "https://example.com/a", "https://example.com/a"],
        ["K", "web"],
        ["i", "https://example.com/a"],
        ["k", "web"],
      ]),
    );
    expect(refs?.root).toEqual({
      form: "external",
      value: "https://example.com/a",
      hint: "https://example.com/a",
      kind: "web",
    });
    expect(refs?.parent).toEqual({
      form: "external",
      value: "https://example.com/a",
      kind: "web",
    });
  });

  it("コメントでなければ commentRefs は undefined", () => {
    expect(commentRefs(noteWith([["E", ROOT]]))).toBeUndefined();
  });

  it("コメントは親が id でなくても返信", () => {
    // 捕まえる変異: isReply を replyTarget の有無だけで決める（記事へのコメントが返信に数えられない）
    expect(isReply(comment([["a", `30023:${ROOT_PK}:post`]]))).toBe(true);
    expect(isReply(noteWith([]))).toBe(false);
    expect(isReply(noteWith([["e", ROOT, "", "root"]]))).toBe(true);
  });

  it("リレーヒントに大文字の E のものも含める", () => {
    // 捕まえる変異: e だけを見る（返信への返信のコメントから根のリレーを引けない）
    expect(eventRelayHints(nested)).toEqual([
      "wss://root.example/",
      "wss://parent.example/",
    ]);
  });
});

describe("buildComment", () => {
  const ROOT_PK = "9".repeat(64);
  const article = evt({
    id: "1".repeat(64),
    pubkey: ROOT_PK,
    kind: 30023,
    tags: [["d", "post"]],
  });
  const address = `30023:${ROOT_PK}:post`;

  it("記事へのコメントは、根を住所で、親を住所と版の id で指す", () => {
    // 捕まえる変異: 根や親を id だけで指す（記事を書き直すと、コメントが記事から外れる）
    const draft = buildComment(article, "よかった", {
      relayHint: "wss://a.example",
    });
    expect(draft.kind).toBe(1111);
    expect(draft.tags).toEqual([
      ["A", address, "wss://a.example"],
      ["K", "30023"],
      ["P", ROOT_PK],
      ["a", address, "wss://a.example"],
      ["e", "1".repeat(64), "wss://a.example", ROOT_PK],
      ["k", "30023"],
      ["p", ROOT_PK],
    ]);
  });

  it("コメントへの返信は、親の根をそのまま引き継ぐ", () => {
    // 捕まえる変異: 親のコメントを根にする（スレッドが記事から切れ、記事のカラムに並ばない）
    const first = evt({
      id: "2".repeat(64),
      pubkey: "8".repeat(64),
      kind: 1111,
      tags: buildComment(article, "よかった").tags,
    });
    const reply = evt({
      id: "3".repeat(64),
      kind: 1111,
      tags: buildComment(first, "ありがとう").tags,
    });
    expect(commentRefs(reply)).toEqual({
      root: { form: "address", address, kind: 30023 },
      parent: {
        form: "id",
        id: "2".repeat(64),
        pubkey: "8".repeat(64),
        kind: 1111,
      },
    });
  });

  it("投稿に付いたコメントへの返信は、投稿を根とするスレッドに残る", () => {
    // 捕まえる変異: 根を引き継がない（Amethyst から始まったスレッドから外れる）
    const note = evt({ id: "4".repeat(64), pubkey: ROOT_PK });
    const amethyst = evt({
      id: "5".repeat(64),
      kind: 1111,
      tags: [
        ["E", note.id, "", ROOT_PK],
        ["K", "1"],
        ["P", ROOT_PK],
        ["e", note.id, "", ROOT_PK],
        ["k", "1"],
        ["p", ROOT_PK],
      ],
    });
    const reply = evt({
      id: "6".repeat(64),
      kind: 1111,
      tags: buildComment(amethyst, "返信").tags,
    });
    expect(threadRoot(reply)?.id).toBe(note.id);
    expect(replyTarget(reply)?.id).toBe(amethyst.id);
  });

  it("ハッシュタグを t タグにする", () => {
    expect(
      buildComment(article, "#Nostr").tags.filter((t) => t[0] === "t"),
    ).toEqual([["t", "nostr"]]);
  });
});

describe("NIP-22 の記述どおり", () => {
  // NIP-22 の例で使われている値
  const ARTICLE_PK =
    "3c9849383bdea883b0bd16fece1ed36d37e37cdde3ce43b17ea4e9192ec11289";
  const ARTICLE_ADDRESS = `30023:${ARTICLE_PK}:f9347ca7`;
  const ARTICLE_ID =
    "5b4fc7fed15672fefe65d2426f67197b71ccc82aa0cc8a9e94f683eb78e07651";
  const FILE_ID =
    "768ac8720cdeb59227cf95e98b66560ef03d8bc9a90d721779e76e68fb42f5e6";
  const FILE_PK =
    "3721e07b079525289877c366ccab47112bdff3d1b44758ca333feb2dbbbbe5bb";
  const COMMENT_ID =
    "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36";
  const COMMENT_PK =
    "93ef2ebaaf9554661f33e79949007900bbc535d239a4c801c33a4d67d3e7f546";
  const relay = "wss://example.relay";

  it("記事へのコメントの例から、根と親を住所で読む", () => {
    // NIP-22 "A comment on a blog post looks like this"
    const refs = commentRefs(
      noteWith(
        [
          ["A", ARTICLE_ADDRESS, relay],
          ["K", "30023"],
          ["P", ARTICLE_PK, relay],
          ["a", ARTICLE_ADDRESS, relay],
          ["e", ARTICLE_ID, relay],
          ["k", "30023"],
          ["p", ARTICLE_PK, relay],
        ],
        { kind: 1111 },
      ),
    );
    expect(refs).toEqual({
      root: { form: "address", address: ARTICLE_ADDRESS, relay, kind: 30023 },
      parent: { form: "address", address: ARTICLE_ADDRESS, relay, kind: 30023 },
    });
  });

  it("コメントへの返信の例から、根を E で、親を e で読む", () => {
    // NIP-22 "A reply to a comment looks like this"。e の 4 番目は作者
    const refs = commentRefs(
      noteWith(
        [
          ["E", FILE_ID, relay, FILE_PK],
          ["K", "1063"],
          ["P", FILE_PK],
          ["e", COMMENT_ID, relay, COMMENT_PK],
          ["k", "1111"],
          ["p", COMMENT_PK],
        ],
        { kind: 1111 },
      ),
    );
    expect(refs).toEqual({
      root: { form: "id", id: FILE_ID, relay, pubkey: FILE_PK, kind: 1063 },
      parent: {
        form: "id",
        id: COMMENT_ID,
        relay,
        pubkey: COMMENT_PK,
        kind: 1111,
      },
    });
  });

  it("Web ページへのコメントの例から、外部の識別子を読む", () => {
    // NIP-22 "A comment on a website's url looks like this"
    const refs = commentRefs(
      noteWith(
        [
          ["I", "https://abc.com/articles/1"],
          ["K", "web"],
          ["i", "https://abc.com/articles/1"],
          ["k", "web"],
        ],
        { kind: 1111 },
      ),
    );
    expect(refs?.root).toEqual({
      form: "external",
      value: "https://abc.com/articles/1",
      kind: "web",
    });
  });

  it("記事へのコメントは、例と同じく根を A・K・P、親を a・e・k・p で指す", () => {
    // NIP-22: "Comments MUST point to the root scope using uppercase tag names ... and MUST point
    // to the parent item with lowercase ones"、"Tags `K` and `k` MUST be present"、
    // "when the parent event is replaceable or addressable, also include an `e` tag referencing its id"
    const article = evt({
      id: ARTICLE_ID,
      pubkey: ARTICLE_PK,
      kind: 30023,
      tags: [["d", "f9347ca7"]],
    });
    const tags = buildComment(article, "Great blog post!", {
      relayHint: relay,
    }).tags;
    expect(tags.map((t) => t[0])).toEqual(["A", "K", "P", "a", "e", "k", "p"]);
    expect(tags).toContainEqual(["A", ARTICLE_ADDRESS, relay]);
    expect(tags).toContainEqual(["a", ARTICLE_ADDRESS, relay]);
    expect(tags.find((t) => t[0] === "e")?.slice(0, 3)).toEqual([
      "e",
      ARTICLE_ID,
      relay,
    ]);
  });

  it("コメントへの返信は、親の根をそのまま引き継ぎ、親を e・k・p で指す", () => {
    // NIP-22 "A reply to a comment looks like this"
    const comment = evt({
      id: COMMENT_ID,
      pubkey: COMMENT_PK,
      kind: 1111,
      tags: [
        ["E", FILE_ID, relay, FILE_PK],
        ["K", "1063"],
        ["P", FILE_PK],
        ["e", FILE_ID, relay, FILE_PK],
        ["k", "1063"],
        ["p", FILE_PK],
      ],
    });
    expect(buildComment(comment, "hi", { relayHint: relay }).tags).toEqual([
      ["E", FILE_ID, relay, FILE_PK],
      ["K", "1063"],
      ["P", FILE_PK],
      ["e", COMMENT_ID, relay, COMMENT_PK],
      ["k", "1111"],
      ["p", COMMENT_PK],
    ]);
  });
});
