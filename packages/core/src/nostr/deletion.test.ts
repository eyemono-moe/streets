import { describe, expect, it } from "vite-plus/test";
import { assertNip46SignPermission } from "../signer/nip46/session-storage";
import {
  buildDeletion,
  deletionTargetAddresses,
  deletionTargetIds,
} from "./deletion";
import type { NostrEvent } from "./event";

const AUTHOR = "b".repeat(64);
const OTHER = "d".repeat(64);

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: AUTHOR,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

describe("buildDeletion", () => {
  it("投稿は e で指し、k に kind を入れる", () => {
    // NIP-09: "A special event with kind `5` ... having a list of one or more `e` or `a`
    // tags, each referencing an event the author is requesting to be deleted. Deletion
    // requests SHOULD include a `k` tag for the kind of each event being requested for deletion."
    const target = evt({ id: "1".repeat(64), kind: 1 });
    expect(buildDeletion(target)).toEqual({
      kind: 5,
      tags: [
        ["e", "1".repeat(64)],
        ["k", "1"],
      ],
      content: "",
    });
  });

  it("NIP-46 の署名器に求める権限に入っている", () => {
    // 捕まえる変異: kind:5 を要求する権限から外す（NIP-46 でログインした人が削除できない）
    assertNip46SignPermission(buildDeletion(evt({})).kind);
  });

  it("k は対象の kind から決める", () => {
    // 捕まえる変異: k を "1" に決め打ちする（既定の kind が 1 なので、ほかの kind で確かめる）
    const target = evt({ id: "1".repeat(64), kind: 7 });
    expect(buildDeletion(target).tags).toContainEqual(["k", "7"]);
  });

  it("住所で指せるイベントは a でも指す", () => {
    // NIP-09 の例: ["a", "<kind>:<pubkey>:<d-identifier>"]
    // "When an `a` tag is used, relays SHOULD delete all versions of the replaceable event up
    // to the `created_at` timestamp of the deletion request event."
    const target = evt({
      id: "1".repeat(64),
      kind: 30023,
      tags: [["d", "my-article"]],
    });
    expect(buildDeletion(target).tags).toEqual([
      ["e", "1".repeat(64)],
      ["a", `30023:${AUTHOR}:my-article`],
      ["k", "30023"],
    ]);
  });
});

describe("削除依頼の対象を読む", () => {
  // NIP-09 の例（id と pubkey は省略されているので補う）
  const example = evt({
    kind: 5,
    tags: [
      ["e", "1".repeat(64)],
      ["e", "2".repeat(64)],
      ["a", `30023:${AUTHOR}:my-article`],
      ["k", "1"],
      ["k", "30023"],
    ],
    content: "these posts were published by accident",
  });

  it("e で指した id をすべて読む", () => {
    expect(deletionTargetIds(example)).toEqual([
      "1".repeat(64),
      "2".repeat(64),
    ]);
  });

  it("a で指した住所を読む", () => {
    expect(deletionTargetAddresses(example)).toEqual([
      { kind: 30023, pubkey: AUTHOR, identifier: "my-article" },
    ]);
  });

  it("d に : が入っていても、2 つ目の : から後ろを d とする", () => {
    // 捕まえる変異: `:` で分けた 3 つ目だけを d にする（別の記事を消す）
    const deletion = evt({ kind: 5, tags: [["a", `30023:${AUTHOR}:a:b`]] });
    expect(deletionTargetAddresses(deletion)).toEqual([
      { kind: 30023, pubkey: AUTHOR, identifier: "a:b" },
    ]);
  });

  it("ほかの人の住所は読まない", () => {
    // NIP-09: "Relays SHOULD delete or stop publishing any referenced events that have an
    // identical `pubkey` as the deletion request."
    const deletion = evt({ kind: 5, tags: [["a", `30023:${OTHER}:x`]] });
    expect(deletionTargetAddresses(deletion)).toEqual([]);
  });

  it("形の壊れた e と a は読まない", () => {
    const deletion = evt({
      kind: 5,
      tags: [
        ["e", "not-hex"],
        ["a", `01:${AUTHOR}:x`],
        ["a", `1:${AUTHOR}:x`],
      ],
    });
    expect(deletionTargetIds(deletion)).toEqual([]);
    expect(deletionTargetAddresses(deletion)).toEqual([]);
  });
});
