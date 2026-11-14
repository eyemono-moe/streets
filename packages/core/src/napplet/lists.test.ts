import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { encodeBech32 } from "../nostr/nip19";
import { assertNip46SignPermission } from "../signer/nip46/session-storage";
import {
  type ListRequest,
  applyListMutation,
  parseListRequest,
  supportedLists,
} from "./lists";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const event = (kind: number, tags: string[][], content = ""): NostrEvent => ({
  id: "e".repeat(64),
  pubkey: ALICE,
  created_at: 1,
  kind,
  tags,
  content,
  sig: "f".repeat(128),
});

const request = (list: object, items: object[], options?: object) => {
  const parsed = parseListRequest(list, items, options, "add");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.request;
};

describe("parseListRequest", () => {
  // > Exactly one of `ListRef.kind` or `ListRef.type` MUST be present.
  it("kind と type のどちらか一方だけで名指しさせる", () => {
    expect(
      parseListRequest({ kind: 10000, type: "mute-list" }, [], {}, "add"),
    ).toEqual({ ok: false, error: "invalid-list-ref" });
    expect(
      request({ type: "mute-list" }, [{ itemType: "hashtag", value: "#Nostr" }])
        .tags,
    ).toEqual([["t", "nostr"]]);
  });

  // NAP-LISTS の「Unsupported Lists」:
  // { "ok": false, "error": "unsupported-list", "reason": "...", "supported": [] }
  it("扱わないリストは断り、扱うリストを添える", () => {
    expect(
      parseListRequest(
        { kind: 10050 },
        [{ itemType: "relay", value: "x" }],
        {},
        "add",
      ),
    ).toEqual({
      ok: false,
      error: "unsupported-list",
      supported: supportedLists(),
    });
  });

  // > MUST reject addressable sets without `identifier`.
  // > MUST validate item types against the selected list's expected NIP-51 tags.
  it("名前の無いセット・そのリストに入らない項目・非公開の項目は断る", () => {
    const item = { itemType: "pubkey", value: ALICE };
    expect(parseListRequest({ kind: 30000 }, [item], {}, "add")).toEqual({
      ok: false,
      error: "missing-identifier",
    });
    expect(parseListRequest({ kind: 10001 }, [item], {}, "add")).toEqual({
      ok: false,
      error: "unsupported-item",
    });
    expect(
      parseListRequest(
        { kind: 10000 },
        [{ ...item, visibility: "private" }],
        {},
        "add",
      ),
    ).toEqual({ ok: false, error: "private-items-unsupported" });
  });

  it("npub は hex にする", () => {
    expect(
      request({ kind: 10000 }, [
        { itemType: "pubkey", value: encodeBech32("npub", BOB) },
      ]).tags,
    ).toEqual([["p", BOB]]);
  });
});

describe("applyListMutation", () => {
  // > MUST preserve unrelated tags, metadata tags, and private items.
  // > MUST append added items after existing items. MUST deduplicate exact item matches.
  it("後ろに足し、同じものは足さず、ほかのタグと非公開の中身は残す", () => {
    const current = event(
      10000,
      [
        ["p", ALICE],
        ["client", "x"],
      ],
      "encrypted-private-items",
    );
    const req: ListRequest = request({ kind: 10000 }, [
      { itemType: "pubkey", value: ALICE },
      { itemType: "pubkey", value: BOB },
    ]);
    expect(applyListMutation(current, req, "add")).toEqual({
      draft: {
        kind: 10000,
        tags: [
          ["p", ALICE],
          ["client", "x"],
          ["p", BOB],
        ],
        content: "encrypted-private-items",
      },
      changed: 1,
      skipped: 1,
    });
  });

  // > For NIP-65, removing `marker: "read"` from an unmarked relay tag rewrites it to
  // > `"write"`; removing `"write"` rewrites it to `"read"`. Removing omitted or
  // > `"read-write"` removes all matching relay URL tags.
  it("NIP-65 は印を書き換えて外し、印の無い外し方はまとめて外す", () => {
    const current = event(10002, [
      ["r", "wss://a.example/"],
      ["r", "wss://b.example/", "write"],
    ]);
    const parsed = parseListRequest(
      { kind: 10002 },
      [
        { itemType: "relay", value: "wss://a.example", marker: "read" },
        { itemType: "relay", value: "wss://b.example" },
      ],
      {},
      "remove",
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(
      applyListMutation(current, parsed.request, "remove").draft.tags,
    ).toEqual([["r", "wss://a.example/", "write"]]);
  });

  it("NIP-65 で読み書きの両方になっているものに印を足しても変えない", () => {
    const current = event(10002, [["r", "wss://a.example/"]]);
    const req = request({ kind: 10002 }, [
      { itemType: "relay", value: "wss://a.example", marker: "read" },
    ]);
    expect(applyListMutation(current, req, "add")).toMatchObject({
      draft: { tags: [["r", "wss://a.example/"]] },
      skipped: 1,
    });
  });

  it("無いセットは、名前と題を付けて作る", () => {
    const req = request(
      { kind: 30000, identifier: "friends" },
      [{ itemType: "pubkey", value: BOB }],
      { create: true, title: "友だち" },
    );
    expect(applyListMutation(undefined, req, "add").draft.tags).toEqual([
      ["d", "friends"],
      ["title", "友だち"],
      ["p", BOB],
    ]);
  });

  it("書き換えるリストは、NIP-46 の接続のときに求める権限に入っている", () => {
    for (const list of supportedLists()) {
      expect(() => assertNip46SignPermission(list.kind)).not.toThrow();
    }
  });
});
