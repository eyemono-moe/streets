import { describe, expect, it } from "vite-plus/test";
import type { MuteTarget } from "../nostr/build/mute";
import type { NostrEvent } from "../nostr/event";
import { createMuteMatcher } from "./mute-match";

const MUTED = "a".repeat(64);
const OTHER = "f".repeat(64);
const VIEWER = "9".repeat(64);
const NOTE_ID = "b".repeat(64);
const ROOT_ID = "c".repeat(64);

const event = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: NOTE_ID,
  pubkey: OTHER,
  created_at: 1,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "d".repeat(128),
  ...overrides,
});

const matcher = (...targets: MuteTarget[]) =>
  createMuteMatcher(
    targets.map((target) => ({ target, visibility: "public" })),
    VIEWER,
  );

const byPubkey = () => matcher({ type: "pubkey", value: MUTED });
const byThread = () => matcher({ type: "thread", value: ROOT_ID });
const byWord = () => matcher({ type: "word", value: "tags" });

describe("createMuteMatcher", () => {
  it("投稿の著者・スレッド・ハッシュタグ・語で当てる", () => {
    expect(byPubkey()(event({ pubkey: MUTED }))).toBe(true);
    // 捕まえる変異: root 参照を比較せず、返信をスレッドミュートから漏らす。
    expect(
      byThread()(
        event({
          tags: [
            ["e", ROOT_ID, "", "root"],
            ["e", "e".repeat(64), "", "reply"],
          ],
        }),
      ),
    ).toBe(true);
    expect(
      matcher({ type: "hashtag", value: "nostr" })(
        event({ tags: [["t", "nostr"]] }),
      ),
    ).toBe(true);
    expect(
      matcher({ type: "word", value: "hello" })(event({ content: "HELLO" })),
    ).toBe(true);
    expect(byPubkey()(event())).toBe(false);
  });

  it("自分のイベントは当てない", () => {
    expect(
      matcher({ type: "pubkey", value: VIEWER })(event({ pubkey: VIEWER })),
    ).toBe(false);
  });

  it("リポストは、した人・元投稿の著者・元投稿のどれかが当たれば当てる", () => {
    const repost = (overrides: Partial<NostrEvent>) =>
      event({ kind: 6, content: "", ...overrides });
    expect(byPubkey()(repost({ pubkey: MUTED }))).toBe(true);
    // 元投稿が埋め込まれていなくても、タグで分かる著者とノートで当てる。
    expect(
      byPubkey()(
        repost({
          tags: [
            ["e", ROOT_ID],
            ["p", MUTED],
          ],
        }),
      ),
    ).toBe(true);
    expect(byThread()(repost({ tags: [["e", ROOT_ID]] }))).toBe(true);
    // 埋め込まれた元投稿の本文に語を当てる。
    const original = event({ id: ROOT_ID, content: "tags の話" });
    expect(
      byWord()(
        repost({ tags: [["e", ROOT_ID]], content: JSON.stringify(original) }),
      ),
    ).toBe(true);
  });

  it("リポストの本文の JSON そのものには語を当てない", () => {
    // 捕まえる変異: 埋め込みの JSON 全体に語を当て、"tags" などで全部のリポストを隠す。
    const original = event({ id: ROOT_ID, content: "ふつうの投稿" });
    expect(
      byWord()(
        event({
          kind: 6,
          tags: [["e", ROOT_ID]],
          content: JSON.stringify(original),
        }),
      ),
    ).toBe(false);
  });

  it("リアクションは、した人と相手の著者・ノートで当てる", () => {
    const reaction = (tags: string[][]) =>
      event({ kind: 7, content: "+", tags });
    expect(
      byPubkey()(
        reaction([
          ["e", ROOT_ID],
          ["p", MUTED],
        ]),
      ),
    ).toBe(true);
    expect(byThread()(reaction([["e", ROOT_ID]]))).toBe(true);
    expect(byPubkey()(reaction([["e", ROOT_ID]]))).toBe(false);
  });

  it("Zap は受領の作者ではなく、送った人で当てる", () => {
    const request = event({
      kind: 9734,
      pubkey: MUTED,
      content: "",
      tags: [["p", VIEWER]],
    });
    const receipt = event({
      kind: 9735,
      pubkey: OTHER,
      content: "",
      tags: [
        ["p", VIEWER],
        ["description", JSON.stringify(request)],
      ],
    });
    expect(byPubkey()(receipt)).toBe(true);
    expect(
      byPubkey()({
        ...receipt,
        tags: [["description", JSON.stringify({ ...request, pubkey: OTHER })]],
      }),
    ).toBe(false);
  });

  it("同じイベントの結果を覚え、本文を読み直さない", () => {
    const match = byWord();
    const note = event({ content: "tags" });
    expect(match(note)).toBe(true);
    // 覚えた結果を返すので、あとから中身が変わっても変わらない（イベントは不変）。
    note.content = "ほかの話";
    expect(match(note)).toBe(true);
  });

  it("ミュートが無いときは何も当てない", () => {
    expect(createMuteMatcher([], VIEWER)(event({ pubkey: MUTED }))).toBe(false);
  });
});
