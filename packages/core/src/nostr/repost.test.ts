import { describe, expect, it } from "vite-plus/test";
import { assertNip46SignPermission } from "../signer/nip46/session-storage";
import type { NostrEvent } from "./event";
import {
  embeddedRepostEvent,
  repostAddress,
  repostTarget,
  buildRepost,
} from "./repost";
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

  it("NIP-10 の印の位置を空けて 5 番目に置かれた作者も読む", () => {
    expect(
      repostTarget(noteWith([["e", ID_B, "wss://b/", "", PK]], { kind: 6 }))
        ?.pubkey,
    ).toBe(PK);
  });

  it("e タグが無ければ undefined (例外を投げない)", () => {
    // 捕まえる変異: throw する —— 1 件の不正なイベントでカラム全体を壊してはいけない
    expect(() => repostTarget(noteWith([], { kind: 6 }))).not.toThrow();
    expect(repostTarget(noteWith([], { kind: 6 }))).toBeUndefined();
  });
});

describe("repostAddress", () => {
  // NIP-18: "When reposting a replaceable event, the repost SHOULD include an `"a"` tag
  // with the event coordinate (`kind:pubkey:d-tag`) of the reposted event."
  const coordinate = `34236:${PK}:clip`;

  it("汎用リポストの a タグを住所として返す", () => {
    expect(
      repostAddress(
        noteWith(
          [
            ["e", ID_B, "wss://b/"],
            ["a", coordinate, "wss://a/"],
            ["k", "34236"],
          ],
          { kind: 16 },
        ),
      ),
    ).toEqual({ form: "address", address: coordinate, relay: "wss://a/" });
  });

  it("a タグが無ければ undefined（その版を指している）", () => {
    // NIP-18: "If the `"a"` tag is not present, it indicates that a specific version
    // of a replaceable event is being reposted"
    expect(
      repostAddress(noteWith([["e", ID_B, "wss://b/"]], { kind: 16 })),
    ).toBeUndefined();
  });

  it("kind:6 の a タグは読まない", () => {
    // 捕まえる変異: kind を見ない —— kind:6 は kind:1 だけを指す
    expect(
      repostAddress(noteWith([["a", coordinate]], { kind: 6 })),
    ).toBeUndefined();
  });

  it("住所として読めない a タグは飛ばす", () => {
    expect(
      repostAddress(
        noteWith(
          [
            ["a", "not-an-address"],
            ["a", coordinate],
          ],
          { kind: 16 },
        ),
      )?.address,
    ).toBe(coordinate);
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

describe("buildRepost", () => {
  it("relayHint が無くても作者を 4 番目からずらさない", () => {
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildRepost(target);
    expect(draft?.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "", "9".repeat(64)],
    ]);
  });

  it("kind は 6", () => {
    expect(buildRepost(evt({}))?.kind).toBe(6);
  });
});

describe("NIP-18 / NIP-70 の記述どおり", () => {
  const target = evt({ id: ID_A, pubkey: PK, content: "hi" });
  const hint = "wss://relay.example/";

  it("e タグを持ち、3 番目にリレー URL を入れる", () => {
    // NIP-18: "The repost event MUST include an `e` tag with the `id` of the note that is
    // being reposted. That tag MUST include a relay URL as its third entry"
    const tag = buildRepost(target, { relayHint: hint })?.tags.find(
      (t) => t[0] === "e",
    );
    expect(tag?.slice(0, 3)).toEqual(["e", ID_A, hint]);
  });

  it("e タグの 4 番目は、NIP-01 の形のとおり作者", () => {
    // NIP-01: `["e", <32-bytes lowercase hex of the id of another event>, <recommended relay URL,
    // optional>, <32-bytes lowercase hex of the author's pubkey, optional>]`。NIP-18 は印を
    // 定めないので、この形になる
    const tag = buildRepost(target, { relayHint: hint })?.tags.find(
      (t) => t[0] === "e",
    );
    expect(tag).toEqual(["e", ID_A, hint, PK]);
  });

  it("作者を p タグに入れる", () => {
    // NIP-18: "The repost SHOULD include a `p` tag with the `pubkey` of the event being reposted."
    expect(buildRepost(target)?.tags).toContainEqual(["p", PK]);
  });

  it("content は元の投稿の JSON", () => {
    // NIP-18: "The `content` of a repost event is _the stringified JSON of the reposted note_."
    expect(JSON.parse(buildRepost(target)?.content ?? "")).toEqual(target);
  });

  it("保護された投稿は content に埋め込まない", () => {
    // NIP-70: "Reposts of protected events MUST NOT embed the reposted event."
    const repost = buildRepost({ ...target, tags: [["-"]] });
    expect(repost?.content).toBe("");
  });

  it("投稿（kind:1）だけを kind:6 でリポストする", () => {
    // NIP-18: "Since `kind 6` reposts are reserved for `kind 1` contents, we use `kind 16`
    // as a "generic repost""
    expect(buildRepost(target)?.kind).toBe(6);
    expect(buildRepost({ ...target, kind: 1111 })?.kind).toBe(16);
  });

  it("NIP-01 の形の e タグから、リポスト元とリレーと作者を読む", () => {
    expect(
      repostTarget(noteWith([["e", ID_B, hint, PK]], { kind: 6 })),
    ).toEqual({ form: "id", id: ID_B, relay: hint, pubkey: PK });
  });

  it("作者を省いた e タグでも、p タグから作者を補う", () => {
    // NIP-01 では e タグの作者は optional。NIP-18 は作者を p タグに入れることを SHOULD とする
    expect(
      repostTarget(
        noteWith(
          [
            ["e", ID_B, hint],
            ["p", PK],
          ],
          { kind: 6 },
        ),
      ),
    ).toEqual({ form: "id", id: ID_B, relay: hint, pubkey: PK });
  });
});

describe("汎用リポスト（NIP-18 の記述どおり）", () => {
  const hint = "wss://relay.example/";
  const comment = evt({ id: ID_A, pubkey: PK, kind: 1111, content: "hi" });
  const article = evt({
    id: ID_B,
    pubkey: PK,
    kind: 30023,
    tags: [["d", "my-article"]],
    content: "# title",
  });

  it("kind:1 以外は kind:16 で書く", () => {
    // NIP-18: "we use `kind 16` as a "generic repost", that can include any kind of event
    // inside other than `kind 1`."
    expect(buildRepost(comment)?.kind).toBe(16);
    expect(buildRepost(article)?.kind).toBe(16);
  });

  it("k タグに元の kind を文字列で入れる", () => {
    // NIP-18: "`kind 16` reposts SHOULD contain a `"k"` tag with the stringified kind number
    // of the reposted event as its value."
    expect(buildRepost(comment)?.tags).toContainEqual(["k", "1111"]);
  });

  it("e タグを持ち、3 番目にリレー URL を入れ、作者を p タグに入れる", () => {
    // NIP-18: "The repost event MUST include an `e` tag with the `id` of the note that is
    // being reposted. That tag MUST include a relay URL as its third entry"
    // "The repost SHOULD include a `p` tag with the `pubkey` of the event being reposted."
    const tags = buildRepost(comment, { relayHint: hint })?.tags;
    expect(tags).toContainEqual(["e", ID_A, hint, PK]);
    expect(tags).toContainEqual(["p", PK]);
  });

  it("置換可能な先には a タグで住所を添える", () => {
    // NIP-18: "When reposting a replaceable event, the repost SHOULD include an `"a"` tag with
    // the event coordinate (`kind:pubkey:d-tag`) of the reposted event."
    expect(buildRepost(article, { relayHint: hint })?.tags).toContainEqual([
      "a",
      `30023:${PK}:my-article`,
      hint,
    ]);
  });

  it("置換可能でない先には a タグを付けない", () => {
    expect(buildRepost(comment)?.tags.some((tag) => tag[0] === "a")).toBe(
      false,
    );
  });

  it("content は元のイベントの JSON", () => {
    // NIP-18: "If the `"a"` tag is not present, ... the `content` field must contain the full
    // JSON string of the reposted event."
    expect(JSON.parse(buildRepost(comment)?.content ?? "")).toEqual(comment);
  });

  it("保護されたイベントは content に埋め込まない", () => {
    // NIP-18: "Reposts of NIP-70-protected events SHOULD always have an empty `content`."
    expect(buildRepost({ ...comment, tags: [["-"]] })?.content).toBe("");
  });

  it("書いた汎用リポストを、読む側がリポスト元として引ける", () => {
    const repost = noteWith(
      buildRepost(article, { relayHint: hint })?.tags ?? [],
      {
        kind: 16,
      },
    );
    expect(repostAddress(repost)).toEqual({
      form: "address",
      address: `30023:${PK}:my-article`,
      relay: hint,
    });
    expect(repostTarget(repost)?.id).toBe(ID_B);
  });

  it("リポスト・削除依頼・置換可能なリスト・一時的なイベントはリポストしない", () => {
    for (const kind of [5, 6, 16, 0, 3, 10002, 22242]) {
      expect(buildRepost({ ...comment, kind })).toBeUndefined();
    }
  });

  it("NIP-46 の署名器に kind:16 の署名を求めている", () => {
    const draft = buildRepost(comment);
    expect(draft).toBeDefined();
    assertNip46SignPermission(draft?.kind ?? 0);
  });
});
