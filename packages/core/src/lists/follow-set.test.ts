import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import {
  InvalidPrivateItemsError,
  PrivateItemsUnavailableError,
} from "../nostr/private-tags";
import type { Signer } from "../signer/signer";
import {
  applyFollowSetChanges,
  changeFollowSet,
  decodeFollowSet,
  followSetName,
  followSetsIncluding,
  latestFollowSets,
  mayBeLegacyMuteSet,
  newFollowSetIdentifier,
  readFollowSet,
} from "./follow-set";

const VIEWER = "a".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);

const listEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "b".repeat(64),
  pubkey: VIEWER,
  created_at: 1,
  kind: 30000,
  tags: [["d", "friends"]],
  content: "",
  sig: "d".repeat(128),
  ...overrides,
});

const signer = (overrides: Partial<Signer> = {}): Signer => ({
  getPublicKey: async () => VIEWER,
  signEvent: async (value) => ({
    ...value,
    id: "b".repeat(64),
    sig: "d".repeat(128),
  }),
  nip44: {
    encrypt: async (_peer, plaintext) => `44:${plaintext}`,
    decrypt: async (_peer, ciphertext) => ciphertext.replace(/^44:/, ""),
  },
  ...overrides,
});

const privateContent = (tags: string[][]) => `44:${JSON.stringify(tags)}`;

describe("readFollowSet", () => {
  it("名前・説明・公開のメンバーを読み、壊れた p と重複を捨てる", () => {
    // 捕まえる変異: hex でない p を人として数える、同じ人を 2 回数える
    const set = readFollowSet(
      listEvent({
        tags: [
          ["d", "friends"],
          ["title", " 友だち "],
          ["description", "よく話す人"],
          ["image", "https://example.com/a.png"],
          ["p", ALICE],
          ["p", ALICE],
          ["p", "npub1xxx"],
          ["p", BOB, "wss://relay.example"],
        ],
        content: privateContent([["p", "3".repeat(64)]]),
      }),
    );
    expect(set).toEqual({
      pubkey: VIEWER,
      identifier: "friends",
      title: "友だち",
      description: "よく話す人",
      image: "https://example.com/a.png",
      members: [
        { pubkey: ALICE, visibility: "public" },
        { pubkey: BOB, visibility: "public" },
      ],
      privatePart: undefined,
    });
  });

  it("題名が無ければ d で呼ぶ", () => {
    // 捕まえる変異: 題名が無いと空の名前になる（カラムの題名が消える）
    expect(followSetName(readFollowSet(listEvent()))).toBe("friends");
    expect(followSetName({ title: undefined, identifier: "" })).toBe(
      "名前のないリスト",
    );
  });
});

describe("mayBeLegacyMuteSet", () => {
  it("d が mute のリストだけを知らせる", () => {
    // 捕まえる変異: 題名で見る（名前を「mute」にしただけのリストまで警告する）
    expect(mayBeLegacyMuteSet({ identifier: "mute" })).toBe(true);
    expect(mayBeLegacyMuteSet({ identifier: "muted-people" })).toBe(false);
  });
});

describe("newFollowSetIdentifier", () => {
  it("呼ぶたびに違う d を作る", () => {
    // 捕まえる変異: 固定の d を返す（2 つ目のリストが 1 つ目を上書きする）
    expect(newFollowSetIdentifier()).not.toBe(newFollowSetIdentifier());
  });
});

describe("decodeFollowSet", () => {
  it("自分のリストは非公開のメンバーも読み、公開と重なる人は公開として数える", async () => {
    // 捕まえる変異: 非公開を読まない、両方にいる人を 2 回数える
    const set = await decodeFollowSet(
      listEvent({
        tags: [
          ["d", "friends"],
          ["p", ALICE],
        ],
        content: privateContent([
          ["p", ALICE],
          ["p", BOB],
        ]),
      }),
      signer(),
      VIEWER,
    );
    expect(set.members).toEqual([
      { pubkey: ALICE, visibility: "public" },
      { pubkey: BOB, visibility: "private" },
    ]);
    expect(set.privatePart).toBe("ready");
  });

  it("ほかの人のリストは復号しない", async () => {
    // 捕まえる変異: 他人の暗号文を自分の鍵で開こうとする（署名器の確認が出る）
    let asked = false;
    const set = await decodeFollowSet(
      listEvent({ pubkey: ALICE, content: privateContent([["p", BOB]]) }),
      signer({
        nip44: {
          encrypt: async () => "",
          decrypt: async () => {
            asked = true;
            return "[]";
          },
        },
      }),
      VIEWER,
    );
    expect(asked).toBe(false);
    expect(set.members).toEqual([]);
    expect(set.privatePart).toBeUndefined();
  });

  it("署名器が NIP-44 を持たなければ、非公開は読めないと返す", async () => {
    const set = await decodeFollowSet(
      listEvent({ content: privateContent([["p", BOB]]) }),
      signer({ nip44: undefined }),
      VIEWER,
    );
    expect(set.privatePart).toBe("unavailable");
  });
});

describe("latestFollowSets", () => {
  it("リストごとに最新の版だけを、名前順に返す", () => {
    // 捕まえる変異: 古い版を残す（一覧に同じリストが 2 つ並ぶ）
    const old = listEvent({ id: "1".repeat(64), created_at: 1 });
    const fresh = listEvent({
      id: "2".repeat(64),
      created_at: 2,
      tags: [
        ["d", "friends"],
        ["title", "友だち"],
      ],
    });
    const work = listEvent({
      id: "3".repeat(64),
      tags: [
        ["d", "work"],
        ["title", "あ仕事"],
      ],
    });
    expect(latestFollowSets([old, work, fresh])).toEqual([work, fresh]);
  });
});

describe("followSetsIncluding", () => {
  it("ほかの人のリストのうち、今の版に入っているものだけを返す", () => {
    // 捕まえる変異: 古い版で判断する（外されたのに「入っている」と出る）、
    // 自分のリストや古い形のミュートの指定まで並べる
    const tagged = (tags: string[][]) => [["p", VIEWER], ...tags];
    const removed = [
      listEvent({
        id: "1".repeat(64),
        pubkey: ALICE,
        tags: tagged([["d", "a"]]),
      }),
      listEvent({
        id: "2".repeat(64),
        pubkey: ALICE,
        created_at: 2,
        tags: [["d", "a"]],
      }),
    ];
    const kept = listEvent({
      id: "3".repeat(64),
      pubkey: BOB,
      tags: tagged([["d", "b"]]),
    });
    const mute = listEvent({
      id: "4".repeat(64),
      pubkey: BOB,
      tags: tagged([["d", "mute"]]),
    });
    const own = listEvent({ id: "5".repeat(64), tags: tagged([["d", "c"]]) });
    expect(
      followSetsIncluding([...removed, kept, mute, own], VIEWER).map(
        (set) => `${set.pubkey}:${set.identifier}`,
      ),
    ).toEqual([`${BOB}:b`]);
  });
});

describe("changeFollowSet", () => {
  it("作るときは名前と説明を公開のタグに置く", async () => {
    // 捕まえる変異: 名前を暗号化する（ほかのクライアントが名前を読めない）
    const draft = await changeFollowSet(signer(), VIEWER, [
      { type: "describe", title: " 友だち ", description: "", image: "" },
    ])(undefined);
    expect(draft).toEqual({
      kind: 30000,
      tags: [["title", "友だち"]],
      content: "",
    });
  });

  it("公開のメンバーの足し外しでは、非公開の部分に触れない", async () => {
    // 捕まえる変異: 公開の変更でも復号する（署名器の確認が余計に出る）
    const content = privateContent([["p", BOB]]);
    const draft = await changeFollowSet(signer({ nip44: undefined }), VIEWER, [
      { type: "add", member: { pubkey: ALICE, visibility: "public" } },
    ])(listEvent({ content }));
    expect(draft.tags).toEqual([
      ["d", "friends"],
      ["p", ALICE],
    ]);
    expect(draft.content).toBe(content);
  });

  it("非公開で足すと、今ある非公開のメンバーの末尾に足して暗号化し直す", async () => {
    // 捕まえる変異: 既存の非公開を読まずに上書きする
    const draft = await changeFollowSet(signer(), VIEWER, [
      { type: "add", member: { pubkey: ALICE, visibility: "private" } },
    ])(listEvent({ content: privateContent([["p", BOB]]) }));
    expect(draft.tags).toEqual([["d", "friends"]]);
    expect(draft.content).toBe(
      privateContent([
        ["p", BOB],
        ["p", ALICE],
      ]),
    );
  });

  it("非公開から外すと、公開の同じ人は残す", async () => {
    const draft = await changeFollowSet(signer(), VIEWER, [
      { type: "remove", member: { pubkey: ALICE, visibility: "private" } },
    ])(
      listEvent({
        tags: [
          ["d", "friends"],
          ["p", ALICE],
        ],
        content: privateContent([["p", ALICE]]),
      }),
    );
    expect(draft.tags).toEqual([
      ["d", "friends"],
      ["p", ALICE],
    ]);
    expect(draft.content).toBe(privateContent([]));
  });

  it("非公開を読めないときは、書かずに投げる", async () => {
    // 捕まえる変異: 読めないまま空で暗号化し、既存の非公開のメンバーを消す
    await expect(
      changeFollowSet(signer(), VIEWER, [
        { type: "add", member: { pubkey: ALICE, visibility: "private" } },
      ])(listEvent({ content: "壊れた暗号文" })),
    ).rejects.toBeInstanceOf(InvalidPrivateItemsError);
    await expect(
      changeFollowSet(signer({ nip44: undefined }), VIEWER, [
        { type: "add", member: { pubkey: ALICE, visibility: "private" } },
      ])(undefined),
    ).rejects.toBeInstanceOf(PrivateItemsUnavailableError);
  });

  it("名前・説明・画像を差し替え、ほかのクライアントが付けたタグは残す", async () => {
    const draft = await changeFollowSet(signer(), VIEWER, [
      {
        type: "describe",
        title: "仲間",
        description: "説明",
        image: "https://example.com/b.png",
      },
    ])(
      listEvent({
        tags: [
          ["d", "friends"],
          ["title", "友だち"],
          ["image", "https://example.com/a.png"],
          ["p", ALICE],
        ],
      }),
    );
    expect(draft.tags).toEqual([
      ["title", "仲間"],
      ["description", "説明"],
      ["image", "https://example.com/b.png"],
      ["d", "friends"],
      ["p", ALICE],
    ]);
  });
});

describe("applyFollowSetChanges", () => {
  it("すでに入っている人は足さず、外すのは同じ公開範囲の人だけ", () => {
    // 捕まえる変異: 同じ人を 2 行並べる、公開範囲を見ずに外す
    const set = readFollowSet(
      listEvent({
        tags: [
          ["d", "friends"],
          ["p", ALICE],
        ],
      }),
    );
    const added = applyFollowSetChanges(set, [
      { type: "add", member: { pubkey: ALICE, visibility: "private" } },
      { type: "add", member: { pubkey: BOB, visibility: "private" } },
      { type: "remove", member: { pubkey: ALICE, visibility: "private" } },
    ]);
    expect(added.members).toEqual([
      { pubkey: ALICE, visibility: "public" },
      { pubkey: BOB, visibility: "private" },
    ]);
  });
});
