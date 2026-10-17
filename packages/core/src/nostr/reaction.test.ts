import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { parseReaction, buildReaction } from "./reaction";

const base: NostrEvent = {
  id: "1".repeat(64),
  pubkey: "2".repeat(64),
  created_at: 1000,
  kind: 7,
  tags: [],
  content: "+",
  sig: "0".repeat(128),
};

const TARGET = "a".repeat(64);

const AUTHOR = "b".repeat(64);

const reaction = (over: Partial<NostrEvent>): NostrEvent => ({
  ...base,
  ...over,
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

describe("parseReaction", () => {
  it("`+` は like", () => {
    // 捕まえる変異: like の分岐を消して全部 text にする
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "+" }))?.content,
    ).toEqual({
      type: "like",
    });
  });

  it("空文字も like", () => {
    // 捕まえる変異: `content === "+"` だけを like にする。NIP-25: 「空文字はクライアントが `+` とみなすべき」—— text に落とすと空のリアクションが画面に出る
    expect(
      parseReaction(reaction({ tags: [["e", TARGET]], content: "" }))?.content,
    ).toEqual({
      type: "like",
    });
  });

  it("emoji タグと `:name:` が一致すれば emoji", () => {
    // 捕まえる変異: emoji タグを見ずに text にする
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: ":smile:",
      }),
    );
    expect(parsed?.content).toEqual({
      type: "emoji",
      name: "smile",
      url: "https://example.com/smile.png",
    });
  });

  it("emoji タグがあっても content が一致しなければ text", () => {
    // 捕まえる変異: content を見ずに emoji タグがあれば emoji にする —— `:smile:` 以外の本文で登録済みの画像が出てしまう
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", TARGET],
          ["emoji", "smile", "https://example.com/smile.png"],
        ],
        content: "🎉",
      }),
    );
    expect(parsed?.content).toEqual({ type: "text", content: "🎉" });
  });

  it("対象は最後の e タグ", () => {
    // 捕まえる変異: 最初の e タグを取る —— NIP-25 はスレッドの祖先を前に並べるので、先頭を取ると祖先へリアクションしたことになる
    const other = "c".repeat(64);
    expect(
      parseReaction(
        reaction({
          tags: [
            ["e", other],
            ["e", TARGET],
          ],
        }),
      )?.targetId,
    ).toBe(TARGET);
  });

  it("対象の著者は最後の p タグ", () => {
    // 捕まえる変異: 最初の p タグを取る (e タグと同じ理由)
    const other = "d".repeat(64);
    expect(
      parseReaction(
        reaction({
          tags: [
            ["e", TARGET],
            ["p", other],
            ["p", AUTHOR],
          ],
        }),
      )?.targetPubkey,
    ).toBe(AUTHOR);
  });

  it("p タグが無くても対象 id は取れる", () => {
    // 捕まえる変異: p タグを必須にする —— NIP-25 は SHOULD であって MUST ではなく、付けないクライアントは実在する
    const parsed = parseReaction(reaction({ tags: [["e", TARGET]] }));
    expect(parsed?.targetId).toBe(TARGET);
    expect(parsed?.targetPubkey).toBeUndefined();
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する。1 件の壊れたイベントでカラム全体が落ちる。
    expect(() => parseReaction(reaction({ tags: [] }))).not.toThrow();
    expect(parseReaction(reaction({ tags: [] }))).toBeUndefined();
  });

  it("64 桁 hex でない e タグは対象として採らない", () => {
    // 捕まえる変異: 形を確かめずに採る。存在しない id を延々と引きに行く。
    expect(
      parseReaction(reaction({ tags: [["e", "not-an-id"]] })),
    ).toBeUndefined();
  });

  it("kind が 7 でなければ undefined", () => {
    // 捕まえる変異: kind を見ない —— リポスト (kind:6) も e タグを持つので、見ないとリポストがリアクションとして解釈される
    expect(
      parseReaction(reaction({ kind: 1, tags: [["e", TARGET]] })),
    ).toBeUndefined();
  });
});

describe("buildReaction", () => {
  it("like は content が + で、e/p/k を持つ", () => {
    // 捕まえる変異: k タグを落とす —— 読み取り側の parseReaction が既に見ているので、落とすと自分が書いたものを自分で読めなくなる
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64), kind: 1 });
    const draft = buildReaction(
      target,
      { type: "like" },
      {
        relayHint: "wss://relay.example",
      },
    );
    expect(draft.kind).toBe(7);
    expect(draft.content).toBe("+");
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64), "wss://relay.example", "9".repeat(64)],
      ["p", "9".repeat(64), "wss://relay.example"],
      ["k", "1"],
    ]);
  });

  it("住所を持つ先には a タグも添え、k タグは target.kind から導出される", () => {
    // 捕まえる変異: k タグを硬コードの "1" に置き換える —— fixture の kind 既定値が 1 なので他は検出できず、この例外ケースで検証する
    const target = evt({
      id: "1".repeat(64),
      pubkey: "9".repeat(64),
      kind: 30023,
      tags: [["d", "post"]],
    });
    const draft = buildReaction(
      target,
      { type: "like" },
      {
        relayHint: "wss://a.example/",
      },
    );
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64), "wss://a.example/", "9".repeat(64)],
      ["a", `30023:${"9".repeat(64)}:post`, "wss://a.example/"],
      ["p", "9".repeat(64), "wss://a.example/"],
      ["k", "30023"],
    ]);
  });

  it("relayHint が無くても著者ヒントの位置を崩さない", () => {
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReaction(target, { type: "like" });
    expect(draft.tags.slice(0, 2)).toEqual([
      ["e", target.id, "", target.pubkey],
      ["p", target.pubkey, ""],
    ]);
  });

  it("カスタム絵文字は emoji タグ 1 つと :shortcode: 1 つ", () => {
    // 捕まえる変異: content に飾りを足す (":x: すごい" など)。NIP-25: "The content can be set only one :shortcode:" —— 足すと他クライアントが素のテキストとして描く
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReaction(target, {
      type: "emoji",
      shortcode: "streetsparrot",
      url: "https://example.invalid/p.png",
    });
    expect(draft.content).toBe(":streetsparrot:");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([
      ["emoji", "streetsparrot", "https://example.invalid/p.png"],
    ]);
  });

  it("text はそのまま content に載り、emoji タグを持たない", () => {
    // 捕まえる変異: text にも emoji タグを付ける
    const draft = buildReaction(evt({}), { type: "text", content: "🎉" });
    expect(draft.content).toBe("🎉");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([]);
  });

  it("往復: buildReaction で作ったものを parseReaction が読み戻せる", () => {
    // 捕まえる変異: どちらか一方だけを NIP に沿わせる —— 書いたものを自分で読めないのは、同じ NIP を 2 箇所で別々に解釈している証拠
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    for (const input of [
      { type: "like" } as const,
      { type: "text", content: "🎉" } as const,
      {
        type: "emoji",
        shortcode: "streetsparrot",
        url: "https://example.invalid/p.png",
      } as const,
    ]) {
      const draft = buildReaction(target, input);
      const parsed = parseReaction({
        ...draft,
        id: "f".repeat(64),
        pubkey: "e".repeat(64),
        created_at: 1_700_000_000,
        sig: "d".repeat(128),
      } as NostrEvent);
      expect(parsed?.targetId).toBe(target.id);
      if (input.type === "like") expect(parsed?.content.type).toBe("like");
      if (input.type === "text") expect(parsed?.content.type).toBe("text");
      if (input.type === "emoji") expect(parsed?.content.type).toBe("emoji");
    }
  });
});

describe("NIP-25 の記述どおり", () => {
  const ID = "1".repeat(64);
  const PK = "9".repeat(64);
  const hint = "wss://relay.example/";
  const note = evt({ id: ID, pubkey: PK });

  it("NIP-25 の例と同じ e と p を持つ", () => {
    // NIP-25 の例: `tags.append(["e", liked.id, hint, liked.pubkey])`、
    // `tags.append(["p", liked.pubkey, hint])`
    const draft = buildReaction(note, { type: "like" }, { relayHint: hint });
    expect(draft.tags.slice(0, 2)).toEqual([
      ["e", ID, hint, PK],
      ["p", PK, hint],
    ]);
  });

  it("「いいね」は content が +", () => {
    // NIP-25: "A reaction with `content` set to `+` or an empty string MUST be interpreted as a "like" or "upvote"."
    expect(buildReaction(note, { type: "like" }).content).toBe("+");
  });

  it("対象の kind を k タグに入れる", () => {
    // NIP-25: "The reaction event MAY include a `k` tag with the stringified kind number of the
    // reacted event as its value." MAY だが、Streets は必ず入れる（理由は buildReaction）
    expect(buildReaction(note, { type: "like" }).tags).toContainEqual([
      "k",
      "1",
    ]);
  });

  it("住所を持つ先には、e と一緒に a を入れる", () => {
    // NIP-25: "If the event being reacted to is an addressable event, an `a` SHOULD be included
    // together with the `e` tag, it must be set to the coordinates (`kind:pubkey:d-tag`)"
    const article = evt({
      id: ID,
      pubkey: PK,
      kind: 30023,
      tags: [["d", "x"]],
    });
    const tags = buildReaction(
      article,
      { type: "like" },
      { relayHint: hint },
    ).tags;
    expect(tags).toContainEqual(["e", ID, hint, PK]);
    expect(tags).toContainEqual(["a", `30023:${PK}:x`, hint]);
  });

  it("e タグが複数あれば、最後のものを対象として読む", () => {
    // NIP-25: "If a client decides to include other `e`, which not recommended, the target event
    // `id` should be last of the `e` tags."
    const parsed = parseReaction(
      reaction({
        tags: [
          ["e", "2".repeat(64)],
          ["e", ID],
        ],
      }),
    );
    expect(parsed?.targetId).toBe(ID);
  });

  it("content が空文字のリアクションも「いいね」として読む", () => {
    // NIP-25: "A reaction with `content` set to `+` or an empty string MUST be interpreted as a "like" or "upvote"."
    expect(
      parseReaction(reaction({ content: "", tags: [["e", ID]] }))?.content,
    ).toEqual({ type: "like" });
  });
});
