import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "./event";
import {
  embeddedRepostEvent,
  eventRelayHints,
  quoteTargets,
  replyTarget,
  repostTarget,
  tagOnlyQuoteTargets,
  threadRoot,
} from "./event-refs";
import { encodeBech32 } from "./nip19";

// content.test.ts / nip19.test.ts と同じ理由: production の `encodeBech32` は hex しか受けないので、naddr のテストデータ用に最小 TLV エンコーダをここでも持つ
type TlvEntry = { type: number; value: Uint8Array };

const encodeTlv = (entries: TlvEntry[]): Uint8Array => {
  const chunks = entries.map(({ type, value }) => {
    const chunk = new Uint8Array(2 + value.length);
    chunk[0] = type;
    chunk[1] = value.length;
    chunk.set(value, 2);
    return chunk;
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const asciiBytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

const kindBytes = (kind: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, kind, false);
  return bytes;
};

const encodeNaddr = (identifier: string, pubkey: string, kind: number) =>
  encodeBech32(
    "naddr",
    bytesToHex(
      encodeTlv([
        { type: 0, value: asciiBytes(identifier) },
        { type: 2, value: hexToBytes(pubkey) },
        { type: 3, value: kindBytes(kind) },
      ]),
    ),
  );

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

  it("marker の無い e タグは無視する", () => {
    // 捕まえる変異: 位置ベースの旧形式を解釈する —— NIP-10 自身が deprecated かつ「曖昧で解決不能」としている
    expect(replyTarget(noteWith([["e", ID_B, "wss://b/"]]))).toBeUndefined();
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

describe("quoteTargets", () => {
  it("q タグを順に返す", () => {
    // 捕まえる変異: 最初の 1 件だけ返す (複数引用が消える)
    expect(
      quoteTargets(
        noteWith([
          ["q", ID_A, "wss://a/", PK],
          ["q", ID_B, "", ""],
        ]),
      ),
    ).toEqual([
      { form: "id", id: ID_A, relay: "wss://a/", pubkey: PK },
      { form: "id", id: ID_B },
    ]);
  });

  it("event-address 形式を address として返す", () => {
    // 捕まえる変異: id と同じ扱いにする (`30023:<pubkey>:<d>` を `{ ids: [...] }` で引き、永久に見つからない)
    expect(
      quoteTargets(noteWith([["q", `30023:${PK}:slug`, "wss://a/"]])),
    ).toEqual([
      { form: "address", address: `30023:${PK}:slug`, relay: "wss://a/" },
    ]);
  });

  it("e タグは引用ではない", () => {
    // 捕まえる変異: e タグも引用として拾う —— NIP-18 の q タグの目的が「引用を返信として現れさせない」ことなので、混ぜると返信が引用として二重に描かれる
    expect(quoteTargets(noteWith([["e", ID_B, "", "root"]]))).toEqual([]);
  });
});

describe("tagOnlyQuoteTargets", () => {
  it("本文に出てこない q タグだけを返す", () => {
    // 捕まえる変異: 本文の言及を引かずに q タグを全部返す —— 本文に埋め込んだ引用が最下部にもう一度出て 2 回描かれる
    const inBody = "a".repeat(64);
    const tagOnly = "b".repeat(64);
    const event = noteWith(
      [
        ["q", inBody],
        ["q", tagOnly],
      ],
      { content: `見て nostr:${encodeBech32("note", inBody)}` },
    );

    expect(tagOnlyQuoteTargets(event)).toEqual([{ form: "id", id: tagOnly }]);
  });

  it("本文にしかない引用は返さない", () => {
    // 捕まえる変異: 本文の言及も足して返す —— 本文側は MentionToken がその位置に描くので、ここで返すと二重になる
    const inBody = "c".repeat(64);
    const event = noteWith([], {
      content: `nostr:${encodeBech32("note", inBody)}`,
    });

    expect(tagOnlyQuoteTargets(event)).toEqual([]);
  });

  it("q タグの座標形式は、本文に一致する naddr が無ければ残す", () => {
    // 捕まえる変異: address 形式を本文と無関係に (常に) 落とす
    const event = noteWith([["q", "30023:abc:slug"]], { content: "本文" });

    expect(tagOnlyQuoteTargets(event)).toEqual([
      { form: "address", address: "30023:abc:slug" },
    ]);
  });

  it("本文の naddr と同じ座標の q タグは返さない", () => {
    // 捕まえる変異: address の突き合わせを外す —— 本文の naddr (eventKind/pubkey/identifier の 3 つ組、q タグの `<kind>:<pubkey>:<identifier>` と同じ) が最下部にも出て二重になる
    const naddr = encodeNaddr("slug", PK, 30023);
    const event = noteWith([["q", `30023:${PK}:slug`]], {
      content: `見て nostr:${naddr}`,
    });

    expect(tagOnlyQuoteTargets(event)).toEqual([]);
  });

  it("同じ id の q タグが 2 本あると 1 件にまとめる", () => {
    // 捕まえる変異: id の重複排除を外す (最下部に同じ引用カードが 2 枚出る)
    const dup = "d".repeat(64);
    const event = noteWith([
      ["q", dup, "wss://a/"],
      ["q", dup, "wss://b/"],
    ]);

    expect(tagOnlyQuoteTargets(event)).toEqual([
      { form: "id", id: dup, relay: "wss://a/" },
    ]);
  });
});

describe("repostTarget", () => {
  it("e タグを返す", () => {
    // 捕まえる変異: relay (tag[2]) を idRef へ渡さない —— 他のアサーションは undefined 判定しか見ないので、構造を丸ごと比較してリレーヒントの消失を確かめる
    expect(
      repostTarget(noteWith([["e", ID_B, "wss://b/"]], { kind: 6 })),
    ).toEqual({
      form: "id",
      id: ID_B,
      relay: "wss://b/",
    });
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する —— 1 件の不正なイベントでカラム全体を壊してはいけない
    expect(() => repostTarget(noteWith([], { kind: 6 }))).not.toThrow();
    expect(repostTarget(noteWith([], { kind: 6 }))).toBeUndefined();
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

  it("マーカー無しの e タグを根と誤認しない", () => {
    // 捕まえる変異: tag[3] を見ずに e タグを拾う —— NIP-10 の位置ベース旧形式は deprecated で「曖昧で解決不能」とされている
    expect(threadRoot(withTags([["e", "1".repeat(64)]]))).toBeUndefined();
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

describe("eventRelayHints", () => {
  it("e タグのリレーヒントを重複無しで集める", () => {
    // 捕まえる変異: 最初の 1 本しか見ない、または重複をそのまま返す。
    expect(
      eventRelayHints(
        noteWith([
          ["e", ID_A, "wss://a.example", "reply"],
          ["e", ID_B, "wss://b.example", "root"],
          ["e", ID_A, "wss://a.example", "mention"],
        ]),
      ),
    ).toEqual(["wss://a.example", "wss://b.example"]);
  });

  it("marker を問わない (reply/root に絞らない)", () => {
    // 捕まえる変異: replyTarget/threadRoot と同じく marker を絞る —— ここは問い合わせ先の手がかりを広く拾う場所で、marker の無い e タグのヒントも無駄にしない
    expect(eventRelayHints(noteWith([["e", ID_A, "wss://a.example"]]))).toEqual(
      ["wss://a.example"],
    );
  });

  it("e タグが無ければ空配列", () => {
    expect(eventRelayHints(noteWith([]))).toEqual([]);
  });

  it("空文字のヒントは落とす (NIP-10: リレー URL は空文字がありうる)", () => {
    // 捕まえる変異: relayOf を通さず生の値を使う —— 空文字を接続先として下流へ渡してしまう
    expect(eventRelayHints(noteWith([["e", ID_A, "", "reply"]]))).toEqual([]);
  });

  it("e 以外のタグは無視する", () => {
    expect(eventRelayHints(noteWith([["q", ID_A, "wss://a.example"]]))).toEqual(
      [],
    );
  });
});

describe("embeddedRepostEvent", () => {
  it("content の JSON がイベントの形なら返す", () => {
    // 捕まえる変異: パースした埋め込みイベントではなく別の値を返す —— 他は全て undefined 判定なので、この成功系だけが値の中身を確かめる
    const embedded = noteWith([], { id: ID_B });
    expect(
      embeddedRepostEvent(
        noteWith([], { kind: 6, content: JSON.stringify(embedded) }),
      ),
    ).toEqual(embedded);
  });

  it("content が空なら undefined", () => {
    // このアサーションが保証すること: 空文字は JSON.parse が投げ try/catch が
    // 拾って undefined になるため、event-refs.ts の早期リターン
    // (`event.content.trim().length === 0`) を削っても本テスト単体では
    // 区別できない（だから「捕まえる変異」は無い）。残す理由は同ファイルのコメント参照。
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: "" })),
    ).toBeUndefined();
  });

  it("JSON として壊れていれば undefined", () => {
    // 捕まえる変異: try/catch を省く
    expect(
      embeddedRepostEvent(noteWith([], { kind: 6, content: "{ not json" })),
    ).toBeUndefined();
  });

  it("イベントの形をしていなければ undefined", () => {
    // 捕まえる変異: isNostrEvent を通さずキャストする —— 埋め込みはリポストした人が書いた任意の文字列で、形すら信用できない
    expect(
      embeddedRepostEvent(
        noteWith([], { kind: 6, content: JSON.stringify({ hello: 1 }) }),
      ),
    ).toBeUndefined();
  });
});
