import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../event";
import { commentRefs, replyTarget, threadRoot } from "../event-refs";
import { encodeBech32 } from "../nip19";
import {
  buildComment,
  buildNote,
  buildQuote,
  buildReply,
  buildReplyTo,
} from "./note";

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

describe("buildReply", () => {
  it("根への返信は root マーカー 1 本だけ", () => {
    // 捕まえる変異: reply マーカーも足す。NIP-10: "should have a single marked 'e' tag of type 'root'"
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    const e = draft.tags.filter((t) => t[0] === "e");
    expect(e).toEqual([
      ["e", "1".repeat(64), "wss://a.example", "root", "9".repeat(64)],
    ]);
  });

  it("返信への返信は親の root を引き継ぎ、root と reply の 2 本を持つ", () => {
    // 捕まえる変異: 親だけを指して root を引き継がない —— スレッドの根が失われ、他クライアントで会話が分断される
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)]],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)],
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

describe("buildQuote", () => {
  it("q タグを立て、e タグは立てない", () => {
    // 捕まえる変異: e タグも立てる —— NIP-18 が明示的に禁じ、立てると引用が返信としてタイムラインに出る
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い", {
      relayHint: "wss://a.example",
    });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([]);
    expect(draft.tags.filter((t) => t[0] === "q")).toEqual([
      ["q", "1".repeat(64), "wss://a.example", "9".repeat(64)],
    ]);
  });

  it("relayHint が無ければ位置要素を空文字で埋める", () => {
    // 捕まえる変異: 3 番目の要素を省略して ["q", id, pubkey] にする —— buildReply と違い型が通ってしまうため、読む側が pubkey を relay-url と取り違える
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.tags.filter((t) => t[0] === "q")).toEqual([
      ["q", "1".repeat(64), "", "9".repeat(64)],
    ]);
  });

  it("引用先の著者に p タグを立てる", () => {
    // 捕まえる変異: p を落とす。引用されたことが相手に通知されない。
    const target = evt({ pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
    ]);
  });

  it("本文に nostr: が無ければ末尾に note1 を足す", () => {
    // 捕まえる変異: 本文をそのまま使う —— q タグだけでは NIP-27 対応クライアントが本文中に引用を描けない
    const target = evt({ id: "1".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.content).toBe(
      `これ面白い\n\nnostr:${encodeBech32("note", "1".repeat(64))}`,
    );
  });

  it("本文に既に nostr: があればそのまま使う", () => {
    // 捕まえる変異: 無条件に末尾へ足す。同じ引用が 2 回描かれる。
    const target = evt({ id: "1".repeat(64) });
    const uri = `nostr:${encodeBech32("note", "1".repeat(64))}`;
    const draft = buildQuote(target, `${uri} これ面白い`);
    expect(draft.content).toBe(`${uri} これ面白い`);
  });

  it("引用本文のハッシュタグを重複なく t タグにし、引用先の t タグは引き継がない", () => {
    const target = evt({ tags: [["t", "target"]] });
    const draft = buildQuote(target, "#Nostr #東京 #nostr");
    expect(draft.tags.filter((tag) => tag[0] === "t")).toEqual([
      ["t", "nostr"],
      ["t", "東京"],
    ]);
  });
});

describe("buildNote", () => {
  it("本文のハッシュタグを t タグにする", () => {
    // 捕まえる変異: t タグを付けない（自分の投稿がハッシュタグのカラムに出ない）
    expect(buildNote("#Nostr と #streets の話").tags).toEqual([
      ["t", "nostr"],
      ["t", "streets"],
    ]);
  });

  it("日本語の長いハッシュタグも t タグにする", () => {
    expect(buildNote("#東京Nostr散歩2026 に参加").tags).toEqual([
      ["t", "東京nostr散歩2026"],
    ]);
  });

  it("同じハッシュタグは 1 回だけ", () => {
    expect(buildNote("#nostr #nostr").tags).toEqual([["t", "nostr"]]);
  });

  it("ハッシュタグが無ければタグも無い", () => {
    expect(buildNote("ただの本文")).toEqual({
      kind: 1,
      tags: [],
      content: "ただの本文",
    });
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

describe("buildReplyTo", () => {
  it("投稿には kind:1、それ以外にはコメントで返す", () => {
    // 捕まえる変異: 投稿にもコメントで返す（コメントを表示できないクライアントから返信が見えなくなる）/
    // コメントに kind:1 で返す（NIP-10 は kind:1 以外への kind:1 の返信を禁じている）
    expect(buildReplyTo(evt({ kind: 1 }), "hi").kind).toBe(1);
    expect(buildReplyTo(evt({ kind: 1111 }), "hi").kind).toBe(1111);
    expect(buildReplyTo(evt({ kind: 20 }), "hi").kind).toBe(1111);
  });
});
