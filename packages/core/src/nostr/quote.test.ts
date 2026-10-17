import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { withReferences } from "./build/references";
import type { NostrEvent } from "./event";
import { encodeEventPointer } from "./event-pointer";
import { encodeBech32 } from "./nip19";
import { quoteTargets, tagOnlyQuoteTargets, buildQuote } from "./quote";

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

  it("引用先の作者には、設定に従って withReferences が p を立てる", () => {
    // 捕まえる変異: buildQuote が p を立てる —— 通知しない設定にしても相手に p が付く
    const target = evt({ pubkey: "9".repeat(64) });
    const draft = buildQuote(target, "これ面白い");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([]);
    const pTags = (notifyQuoted: boolean) =>
      withReferences(draft, { notifyQuoted }).tags.filter((t) => t[0] === "p");
    expect(pTags(true)).toEqual([["p", "9".repeat(64)]]);
    expect(pTags(false)).toEqual([]);
  });

  it("引用ボタンで note を貼った本文でも、q の作者に p を立てる", () => {
    // 捕まえる変異: 本文の bech32 から作者を取る —— note には作者が無く、p が落ちる
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildQuote(
      target,
      `nostr:${encodeBech32("note", target.id)} これ面白い`,
    );
    expect(
      withReferences(draft, { notifyQuoted: true }).tags.filter(
        (t) => t[0] === "p",
      ),
    ).toEqual([["p", "9".repeat(64)]]);
  });

  it("本文に引用先が無ければ末尾に nevent を足す", () => {
    // 捕まえる変異: 本文をそのまま使う —— q タグだけでは NIP-27 対応クライアントが本文中に引用を描けない
    const target = evt({ id: "1".repeat(64) });
    const draft = buildQuote(target, "これ面白い", {
      relayHint: "wss://a.example",
    });
    expect(draft.content).toBe(
      `これ面白い\n\nnostr:${encodeEventPointer(target, ["wss://a.example"])}`,
    );
  });

  it("本文が既に引用先を指していればそのまま使う（リレーの違う nevent や note でも）", () => {
    // 捕まえる変異: 文字列の一致で比べる。貼ったリンクとリレーが違うと、同じ引用が 2 回描かれる。
    const target = evt({ id: "1".repeat(64) });
    for (const uri of [
      `nostr:${encodeBech32("note", target.id)}`,
      `nostr:${encodeEventPointer(target, ["wss://b.example"])}`,
    ]) {
      const draft = buildQuote(target, `${uri} これ面白い`, {
        relayHint: "wss://a.example",
      });
      expect(draft.content).toBe(`${uri} これ面白い`);
    }
  });

  it("住所を持つ先は q も本文も住所で指す", () => {
    // 捕まえる変異: q を id のままにする —— 本文の naddr と食い違い、読む側で同じ引用が 2 つ描かれる
    const target = evt({
      kind: 30023,
      pubkey: "9".repeat(64),
      tags: [["d", "slug"]],
    });
    const draft = buildQuote(target, "これ面白い", {
      relayHint: "wss://a.example",
    });
    expect(draft.tags.filter((t) => t[0] === "q")).toEqual([
      ["q", `30023:${"9".repeat(64)}:slug`, "wss://a.example"],
    ]);
    expect(draft.content).toBe(
      `これ面白い\n\nnostr:${encodeEventPointer(target, ["wss://a.example"])}`,
    );
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

describe("NIP-18 の引用の記述どおり", () => {
  const hint = "wss://relay.example/";

  it("q タグは id・リレー・作者の順", () => {
    // NIP-18: `["q", "<event-id> or <event-address>", "<relay-url>", "<pubkey-if-a-regular-event>"]`
    const target = evt({ id: ID_A, pubkey: PK });
    expect(buildQuote(target, "見て", { relayHint: hint }).tags).toContainEqual(
      ["q", ID_A, hint, PK],
    );
  });

  it("住所を持つ先は、q タグを住所で指し、作者を添えない", () => {
    // NIP-18 の q は event-address でもよく、作者は "pubkey-if-a-regular-event"
    const article = evt({
      id: ID_A,
      pubkey: PK,
      kind: 30023,
      tags: [["d", "x"]],
    });
    expect(
      buildQuote(article, "見て", { relayHint: hint }).tags.find(
        (t) => t[0] === "q",
      ),
    ).toEqual(["q", `30023:${PK}:x`, hint]);
  });

  it("引用には e タグを立てない", () => {
    // NIP-18: "The `q` tag ensures quote reposts are not pulled and included as replies in threads."
    const target = evt({ id: ID_A, pubkey: PK });
    expect(buildQuote(target, "見て").tags.some((t) => t[0] === "e")).toBe(
      false,
    );
  });

  it("本文の nevent は q タグにする", () => {
    // NIP-18: "Mentions to NIP-21 entities like `nevent`, `note` and `naddr` on any event must be
    // converted into `q` tags."
    const target = evt({ id: ID_A, pubkey: PK });
    const draft = withReferences(
      { kind: 1, content: `nostr:${encodeEventPointer(target)}`, tags: [] },
      {},
    );
    expect(draft.tags.find((t) => t[0] === "q")?.[1]).toBe(ID_A);
  });

  it("q タグからは、id・リレー・作者を読む", () => {
    expect(quoteTargets(noteWith([["q", ID_B, hint, PK]]))).toEqual([
      { form: "id", id: ID_B, relay: hint, pubkey: PK },
    ]);
  });
});
