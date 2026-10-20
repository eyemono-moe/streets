import { describe, expect, it } from "vite-plus/test";
import { assertNip46SignPermission } from "../signer/nip46/session-storage";
import { buildReport } from "./report";

const PUBKEY = "a".repeat(64);
const EVENT = "b".repeat(64);

describe("buildReport", () => {
  // NIP-56 の例: { "kind": 1984, "tags": [["p", "<pubkey>", "nudity"], ...], "content": "" }
  it("人の通報は、p の 3 番目に種類を置く", () => {
    expect(
      buildReport({ type: "pubkey", pubkey: PUBKEY }, "nudity", ""),
    ).toEqual({
      kind: 1984,
      tags: [["p", PUBKEY, "nudity"]],
      content: "",
    });
  });

  // NIP-56 の例: "tags": [["e", "<eventId>", "illegal"], ["p", "<pubkey>"]],
  // "content": "He's insulting the king!"
  it("投稿の通報は、e に種類を置き、作者を p に添える", () => {
    expect(
      buildReport(
        { type: "event", id: EVENT, pubkey: PUBKEY },
        "illegal",
        "He's insulting the king!",
      ),
    ).toEqual({
      kind: 1984,
      tags: [
        ["e", EVENT, "illegal"],
        ["p", PUBKEY],
      ],
      content: "He's insulting the king!",
    });
  });

  it("通報は、NIP-46 の接続のときに求める権限に入っている", () => {
    expect(() => assertNip46SignPermission(1984)).not.toThrow();
  });
});
