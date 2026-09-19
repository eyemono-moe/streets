import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { Signer } from "../signer/signer";
import {
  InvalidPrivateMuteListError,
  applyMuteChanges,
  changeMuteList,
  changeMuteListMany,
  decodeMuteList,
  matchingMutes,
  parseMuteTarget,
  threadMuteTarget,
} from "./mute-list";

const PUBKEY = "a".repeat(64);
const EVENT_ID = "b".repeat(64);
const ROOT_ID = "c".repeat(64);

const event = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: EVENT_ID,
  pubkey: PUBKEY,
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello NOSTR",
  sig: "d".repeat(128),
  ...overrides,
});

const signer = (overrides: Partial<Signer> = {}): Signer => ({
  getPublicKey: async () => PUBKEY,
  signEvent: async (value) => ({
    ...value,
    id: EVENT_ID,
    sig: "d".repeat(128),
  }),
  nip44: {
    encrypt: async (_peer, plaintext) => `44:${plaintext}`,
    decrypt: async (_peer, ciphertext) => ciphertext.replace(/^44:/, ""),
  },
  ...overrides,
});

describe("parseMuteTarget", () => {
  it("種別に合う NIP-19 と hex だけを受ける", () => {
    // 捕まえる変異: pubkey 入力で nsec/note を prefix を見ずに受け入れる。
    expect(parseMuteTarget("pubkey", PUBKEY)).toEqual({
      type: "pubkey",
      value: PUBKEY,
    });
    expect(parseMuteTarget("pubkey", "nsec1invalid")).toBeUndefined();
    expect(parseMuteTarget("thread", EVENT_ID)).toEqual({
      type: "thread",
      value: EVENT_ID,
    });
  });

  it("単語を小文字化し、ハッシュタグの先頭記号を落とす", () => {
    expect(parseMuteTarget("word", "  NoStr ")).toEqual({
      type: "word",
      value: "nostr",
    });
    expect(parseMuteTarget("hashtag", "###nostr")).toEqual({
      type: "hashtag",
      value: "nostr",
    });
  });
});

describe("decodeMuteList / changeMuteList", () => {
  it("リストが未作成でも NIP-44 非対応を編集可能とは扱わない", async () => {
    // 捕まえる変異: event が無いことだけで privatePart を ready にする。
    await expect(
      decodeMuteList(undefined, signer({ nip44: undefined }), PUBKEY),
    ).resolves.toEqual({ entries: [], privatePart: "unavailable" });
  });

  it("公開タグと NIP-44 非公開タグを同じ entry 形式へ読む", async () => {
    // 捕まえる変異: content を復号せず、公開タグだけを返す。
    await expect(
      decodeMuteList(
        event({
          kind: 10_000,
          tags: [["p", PUBKEY]],
          content: '44:[["word","nostr"]]',
        }),
        signer(),
        PUBKEY,
      ),
    ).resolves.toEqual({
      entries: [
        { target: { type: "pubkey", value: PUBKEY }, visibility: "public" },
        { target: { type: "word", value: "nostr" }, visibility: "private" },
      ],
      privatePart: "ready",
    });
  });

  it("公開項目だけの既存リストでも NIP-44 非対応を示す", async () => {
    // 捕まえる変異: 空 content を復号済みとして privatePart を ready にする。
    await expect(
      decodeMuteList(
        event({ kind: 10_000, tags: [["p", PUBKEY]], content: "" }),
        signer({ nip44: undefined }),
        PUBKEY,
      ),
    ).resolves.toEqual({
      entries: [
        { target: { type: "pubkey", value: PUBKEY }, visibility: "public" },
      ],
      privatePart: "unavailable",
    });
  });

  it("旧 NIP-04 content は decrypt だけを委譲する", async () => {
    const decrypt = vi.fn(async () => '[["t","nostr"]]');
    const legacy = signer({ nip04: { decrypt }, nip44: undefined });
    const result = await decodeMuteList(
      event({ kind: 10_000, content: "cipher?iv=vector" }),
      legacy,
      PUBKEY,
    );
    expect(result.entries).toEqual([
      {
        target: { type: "hashtag", value: "nostr" },
        visibility: "private",
      },
    ]);
    expect(result.privatePart).toBe("unavailable");
    expect(decrypt).toHaveBeenCalledWith(PUBKEY, "cipher?iv=vector");
  });

  it("公開項目の追加は未知タグと暗号文を一字も変えない", async () => {
    // 捕まえる変異: public 変更でも content を空にする。
    const current = event({
      kind: 10_000,
      tags: [["future", "keep"]],
      content: "opaque",
    });
    const draft = await changeMuteList(signer(), PUBKEY, {
      type: "add",
      entry: {
        target: { type: "word", value: "NOSTR" },
        visibility: "public",
      },
    })(current);
    expect(draft).toEqual({
      kind: 10_000,
      tags: [
        ["future", "keep"],
        ["word", "nostr"],
      ],
      content: "opaque",
    });
  });

  it("非公開項目の追加は未知の非公開タグを保って NIP-44 で再暗号化する", async () => {
    const encrypt = vi.fn(async (_peer, plaintext) => `next:${plaintext}`);
    const capable = signer({
      nip44: {
        decrypt: async () => '[["future","keep"]]',
        encrypt,
      },
    });
    const draft = await changeMuteList(capable, PUBKEY, {
      type: "add",
      entry: {
        target: { type: "pubkey", value: PUBKEY },
        visibility: "private",
      },
    })(event({ kind: 10_000, content: "old" }));
    expect(encrypt).toHaveBeenCalledWith(
      PUBKEY,
      '[["future","keep"],["p","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]]',
    );
    expect(draft.content).toMatch(/^next:/);
  });

  it("壊れた非公開 content を上書きしない", async () => {
    // 捕まえる変異: JSON 不正を空配列として扱い、既存項目を消して保存する。
    await expect(
      changeMuteList(
        signer({
          nip44: {
            decrypt: async () => "not-json",
            encrypt: async () => "overwritten",
          },
        }),
        PUBKEY,
        {
          type: "add",
          entry: {
            target: { type: "word", value: "x" },
            visibility: "private",
          },
        },
      )(event({ kind: 10_000, content: "cipher" })),
    ).rejects.toBeInstanceOf(InvalidPrivateMuteListError);
  });
});

describe("changeMuteListMany", () => {
  it("いくつもの変更を、復号・暗号化 1 回ずつでまとめて当てる", async () => {
    // 捕まえる変異: 変更ごとに復号・暗号化する（拡張機能の確認が変更の数だけ出る）。
    const decrypt = vi.fn(async () => '[["word","old"]]');
    const encrypt = vi.fn(
      async (_peer: string, plaintext: string) => plaintext,
    );
    const draft = await changeMuteListMany(
      signer({ nip44: { decrypt, encrypt } }),
      PUBKEY,
      [
        {
          type: "add",
          entry: {
            target: { type: "word", value: "a" },
            visibility: "private",
          },
        },
        {
          type: "remove",
          entry: {
            target: { type: "word", value: "old" },
            visibility: "private",
          },
        },
        {
          type: "add",
          entry: {
            target: { type: "hashtag", value: "x" },
            visibility: "public",
          },
        },
      ],
    )(event({ kind: 10_000, content: "cipher" }));
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(draft.content).toBe('[["word","a"]]');
    expect(draft.tags).toEqual([["t", "x"]]);
  });

  it("公開の変更だけなら、非公開部に触れない", async () => {
    const decrypt = vi.fn(async () => "[]");
    const draft = await changeMuteListMany(
      signer({ nip44: { decrypt, encrypt: async () => "x" } }),
      PUBKEY,
      [
        {
          type: "add",
          entry: { target: { type: "word", value: "a" }, visibility: "public" },
        },
      ],
    )(event({ kind: 10_000, content: "keep" }));
    expect(decrypt).not.toHaveBeenCalled();
    expect(draft.content).toBe("keep");
  });
});

describe("applyMuteChanges", () => {
  const entry = (value: string, visibility: "private" | "public") => ({
    target: { type: "word" as const, value },
    visibility,
  });

  it("足す・外す・公開範囲を移すを、保存と同じ規則で当てる", () => {
    const next = applyMuteChanges(
      [entry("a", "private"), entry("b", "public")],
      [
        { type: "add", entry: entry("A", "private") },
        { type: "remove", entry: entry("b", "public") },
        { type: "move", entry: entry("a", "private"), to: "public" },
      ],
    );
    // 単語は小文字にそろうので、"A" は "a" と同じもの。
    expect(next).toEqual([entry("a", "public")]);
  });
});

describe("matchingMutes", () => {
  it("著者・根スレッド・ハッシュタグ・単語をまとめて返す", () => {
    // 捕まえる変異: root 参照を比較せず、返信をスレッドミュートから漏らす。
    const found = matchingMutes(
      [
        { target: { type: "pubkey", value: PUBKEY }, visibility: "public" },
        { target: { type: "thread", value: ROOT_ID }, visibility: "private" },
        {
          target: { type: "hashtag", value: "nostr" },
          visibility: "private",
        },
        { target: { type: "word", value: "nostr" }, visibility: "private" },
      ],
      event({
        tags: [
          ["e", ROOT_ID, "", "root"],
          ["e", "e".repeat(64), "", "reply"],
          ["t", "nostr"],
        ],
      }),
    );
    expect(found).toHaveLength(4);
  });

  it("メニューのスレッド対象は root があれば root を使う", () => {
    expect(
      threadMuteTarget(event({ tags: [["e", ROOT_ID, "", "root"]] })),
    ).toEqual({ type: "thread", value: ROOT_ID });
  });
});
