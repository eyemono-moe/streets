import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { PrivateItemsUnavailableError } from "../nostr/private-tags";
import type { RelayUrl } from "../relay/relay-connection";
import type { Signer } from "../signer/signer";
import {
  applyBlockedRelayChange,
  blockedRelaysToApply,
  changeBlockedRelays,
  decodeBlockedRelayList,
  loadBlockedRelaysCache,
  saveBlockedRelaysCache,
} from "./blocked-relay-list";

const PUBKEY = "a".repeat(64);

const event = (tags: string[][], content = ""): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: PUBKEY,
  created_at: 1000,
  kind: 10_006,
  tags,
  content,
  sig: "0".repeat(128),
});

const signer = (overrides: Partial<Signer> = {}): Signer => ({
  getPublicKey: async () => PUBKEY,
  signEvent: async (value) => ({
    ...value,
    id: "0".repeat(64),
    sig: "0".repeat(128),
  }),
  nip44: {
    encrypt: async (_peer, plaintext) => `44:${plaintext}`,
    decrypt: async (_peer, ciphertext) => ciphertext.replace(/^44:/, ""),
  },
  ...overrides,
});

const sealed = (tags: string[][]) => `44:${JSON.stringify(tags)}`;
const url = (value: string) => value as RelayUrl;

describe("繋がないリレー（kind:10006）を読む", () => {
  it("公開と非公開の relay タグを読み、形をそろえて重複を落とす", async () => {
    const decoded = await decodeBlockedRelayList(
      event(
        [
          ["relay", "wss://Spam.example"],
          ["p", "b".repeat(64)],
          ["relay", "wss://spam.example/"],
          ["relay", "ふつうの文字列"],
          ["relay", "https://not-a-relay.example"],
        ],
        sealed([
          ["relay", "wss://hidden.example"],
          ["relay", "wss://hidden.example/"],
        ]),
      ),
      signer(),
      PUBKEY,
    );
    expect(decoded).toEqual({
      entries: [
        { url: "wss://spam.example/", visibility: "public" },
        { url: "wss://hidden.example/", visibility: "private" },
      ],
      privatePart: "ready",
      complete: true,
    });
  });

  it("非公開の部分を読めないときは、公開の項目だけで、読み切れていないと示す", async () => {
    const decoded = await decodeBlockedRelayList(
      event([["relay", "wss://spam.example/"]], "壊れた暗号文"),
      signer({
        nip44: {
          encrypt: async () => "",
          decrypt: async () => {
            throw new Error("bad");
          },
        },
      }),
      PUBKEY,
    );
    expect(decoded.entries).toEqual([
      { url: "wss://spam.example/", visibility: "public" },
    ]);
    expect(decoded.privatePart).toBe("invalid");
    expect(decoded.complete).toBe(false);
  });

  it("content が空なら、NIP-44 の無い署名器でも読み切れている（書けはしない）", async () => {
    const decoded = await decodeBlockedRelayList(
      event([["relay", "wss://spam.example/"]]),
      signer({ nip44: undefined }),
      PUBKEY,
    );
    expect(decoded.privatePart).toBe("unavailable");
    expect(decoded.complete).toBe(true);
  });
});

describe("繋がないリレーを足す・外す", () => {
  it("公開の項目を変えるときは、ほかのタグと暗号文に触れない", async () => {
    const draft = await changeBlockedRelays(
      signer({ nip44: undefined }),
      PUBKEY,
      {
        type: "remove",
        entry: { url: url("wss://old.example/"), visibility: "public" },
      },
    )(
      event(
        [
          ["relay", "wss://old.example"],
          ["client", "other"],
        ],
        "encrypted",
      ),
    );
    expect(draft).toEqual({
      kind: 10_006,
      tags: [["client", "other"]],
      content: "encrypted",
    });
  });

  it("非公開に足すと、タグは変えずに暗号文の relay タグだけを書き換える", async () => {
    const draft = await changeBlockedRelays(signer(), PUBKEY, {
      type: "add",
      entry: { url: url("wss://new.example/"), visibility: "private" },
    })(
      event(
        [["relay", "wss://pub.example/"]],
        sealed([
          ["relay", "wss://a.example/"],
          ["x", "keep"],
        ]),
      ),
    );
    expect(draft.tags).toEqual([["relay", "wss://pub.example/"]]);
    expect(JSON.parse(draft.content.replace(/^44:/, ""))).toEqual([
      ["relay", "wss://a.example/"],
      ["x", "keep"],
      ["relay", "wss://new.example/"],
    ]);
  });

  it("非公開を外すと、形をそろえない URL もまとめて落とす", async () => {
    const draft = await changeBlockedRelays(signer(), PUBKEY, {
      type: "remove",
      entry: { url: url("wss://a.example/"), visibility: "private" },
    })(
      event(
        [],
        sealed([
          ["relay", "wss://A.example"],
          ["relay", "wss://b.example/"],
        ]),
      ),
    );
    expect(JSON.parse(draft.content.replace(/^44:/, ""))).toEqual([
      ["relay", "wss://b.example/"],
    ]);
  });

  it("NIP-44 の無い署名器では、非公開の項目を書かずに投げる", async () => {
    await expect(
      changeBlockedRelays(signer({ nip44: undefined }), PUBKEY, {
        type: "add",
        entry: { url: url("wss://new.example/"), visibility: "private" },
      })(undefined),
    ).rejects.toBeInstanceOf(PrivateItemsUnavailableError);
  });

  it("保存を待たずに見せる一覧は、同じ公開範囲に同じ URL を 2 つ置かない", () => {
    const entry = {
      url: url("wss://a.example/"),
      visibility: "private" as const,
    };
    const added = applyBlockedRelayChange([entry], { type: "add", entry });
    expect(added).toEqual([entry]);
    expect(
      applyBlockedRelayChange([entry, { ...entry, visibility: "public" }], {
        type: "remove",
        entry,
      }),
    ).toEqual([{ ...entry, visibility: "public" }]);
  });
});

describe("読み取り層へ当てる繋がないリレー", () => {
  it("読み切れたら、公開と非公開を 1 本ずつにして当て、控えも差し替える", () => {
    expect(
      blockedRelaysToApply(
        {
          entries: [
            { url: url("wss://a.example/"), visibility: "public" },
            { url: url("wss://a.example/"), visibility: "private" },
            { url: url("wss://b.example/"), visibility: "private" },
          ],
          privatePart: "ready",
          complete: true,
        },
        [url("wss://gone.example/")],
      ),
    ).toEqual({
      relays: ["wss://a.example/", "wss://b.example/"],
      cache: ["wss://a.example/", "wss://b.example/"],
    });
  });

  it("非公開の部分を読めなければ、控えの分も止め続け、控えは残す", () => {
    expect(
      blockedRelaysToApply(
        {
          entries: [{ url: url("wss://a.example/"), visibility: "public" }],
          privatePart: "invalid",
          complete: false,
        },
        [url("wss://hidden.example/")],
      ),
    ).toEqual({ relays: ["wss://a.example/", "wss://hidden.example/"] });
  });
});

describe("端末に控える繋がないリレー", () => {
  it("控えた一覧をそのまま読み戻す", () => {
    const relays = ["wss://a.example/", "wss://b.example/"];
    expect(loadBlockedRelaysCache(saveBlockedRelaysCache(relays))).toEqual(
      relays,
    );
  });

  it("控えが無い・壊れているなら何も止めない", () => {
    expect(loadBlockedRelaysCache(null)).toEqual([]);
    expect(loadBlockedRelaysCache("{")).toEqual([]);
    expect(loadBlockedRelaysCache('{"a":1}')).toEqual([]);
    expect(loadBlockedRelaysCache('[1, "wss://ok.example"]')).toEqual([
      "wss://ok.example/",
    ]);
  });
});
