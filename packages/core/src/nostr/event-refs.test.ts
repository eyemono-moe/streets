import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { eventRelayHints, idRefOfPointer } from "./event-refs";
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

describe("idRefOfPointer", () => {
  it("nevent の先頭のリレーと作者を持ち回る", () => {
    expect(
      idRefOfPointer({
        kind: "nevent",
        id: ID_A,
        relays: ["wss://a/", "wss://b/"],
        author: PK,
      }),
    ).toEqual({ form: "id", id: ID_A, relay: "wss://a/", pubkey: PK });
  });

  it("note は id だけ", () => {
    expect(idRefOfPointer({ kind: "note", id: ID_A })).toEqual({
      form: "id",
      id: ID_A,
    });
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
