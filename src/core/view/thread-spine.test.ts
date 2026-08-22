import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { threadSpine } from "./thread-spine";

/** `id` の 1 文字目だけで区別する読みやすい偽イベント。 */
const note = (
  key: string,
  options?: { root?: string; reply?: string; at?: number },
): NostrEvent => {
  const tags: string[][] = [];
  if (options?.root) tags.push(["e", options.root.repeat(64), "", "root"]);
  if (options?.reply) tags.push(["e", options.reply.repeat(64), "", "reply"]);
  return {
    id: key.repeat(64),
    pubkey: "b".repeat(64),
    created_at: options?.at ?? 1_700_000_000,
    kind: 1,
    tags,
    content: key,
    sig: "c".repeat(128),
  } as NostrEvent;
};
const id = (key: string) => key.repeat(64);

describe("threadSpine", () => {
  it("祖先を根に近い順で並べる", () => {
    // 捕まえる変異: replyTarget ではなく threadRoot で登る —— 中間の
    // 祖先を飛ばして根へ跳ぶので、ancestors が 1 件になる。
    const root = note("1");
    const mid = note("2", { root: "1", reply: "1" });
    const focus = note("3", { root: "1", reply: "2" });
    const spine = threadSpine([focus, mid, root], id("3"));
    expect(spine.ancestors.map((e) => e.content)).toEqual(["1", "2"]);
    expect(spine.reachedRoot).toBe(true);
  });

  it("focus 自身が根なら祖先は空で reachedRoot は true", () => {
    // 捕まえる変異: 祖先が空のとき reachedRoot を false にする ——
    // 根を開いただけで「連鎖が切れている」と表示される。
    const root = note("1");
    const spine = threadSpine([root], id("1"));
    expect(spine.ancestors).toEqual([]);
    expect(spine.reachedRoot).toBe(true);
  });

  it("途中の祖先が欠けていれば reachedRoot は false", () => {
    // 捕まえる変異: 常に true を返す —— 祖先が欠けたスレッドが
    // 「根から始まっている」ように見え、誰が誰に返信したのかを読み違える。
    const focus = note("3", { root: "1", reply: "2" });
    const spine = threadSpine([focus], id("3"));
    expect(spine.ancestors).toEqual([]);
    expect(spine.reachedRoot).toBe(false);
  });

  it("replies は focus を直接の親とするものだけ", () => {
    // 捕まえる変異: 根を指す全イベントを replies に入れる —— 孫や
    // 別の枝が混ざり、1 節が決めた「背骨だけ」が壊れる。
    const root = note("1");
    const focus = note("2", { root: "1", reply: "1" });
    const child = note("3", { root: "1", reply: "2" });
    const grandchild = note("4", { root: "1", reply: "3" });
    const sibling = note("5", { root: "1", reply: "1" });
    const spine = threadSpine(
      [root, focus, child, grandchild, sibling],
      id("2"),
    );
    expect(spine.replies.map((e) => e.content)).toEqual(["3"]);
  });

  it("replies は created_at 昇順", () => {
    // 捕まえる変異: 降順にする / 並べ替えない
    const focus = note("1");
    const later = note("3", { reply: "1", at: 1_700_000_200 });
    const earlier = note("2", { reply: "1", at: 1_700_000_100 });
    const spine = threadSpine([focus, later, earlier], id("1"));
    expect(spine.replies.map((e) => e.content)).toEqual(["2", "3"]);
  });

  it("created_at が同値なら id 昇順", () => {
    // 捕まえる変異: tie-break を持たない —— 入力順に依存して並びが
    // 揺れ、リレーの配送順で表示が変わる。
    const focus = note("1");
    const b = note("3", { reply: "1", at: 1_700_000_100 });
    const a = note("2", { reply: "1", at: 1_700_000_100 });
    const spine = threadSpine([focus, b, a], id("1"));
    expect(spine.replies.map((e) => e.content)).toEqual(["2", "3"]);
  });

  it("自分自身を親に指すイベントで無限ループしない", () => {
    // 捕まえる変異: 訪問済み集合を持たない。リレーは NIP-10 のタグ意味論を
    // 検証しないので、この形のイベントは publish できてしまう。
    const loop = note("1", { reply: "1" });
    const spine = threadSpine([loop], id("1"));
    expect(spine.ancestors).toEqual([]);
    expect(spine.reachedRoot).toBe(false);
  });

  it("祖先どうしが循環していても止まる", () => {
    // 捕まえる変異: 上と同じ。2 件で輪を作る形。
    const a = note("1", { reply: "2" });
    const b = note("2", { reply: "1" });
    const spine = threadSpine([a, b], id("1"));
    expect(spine.ancestors.length).toBeLessThanOrEqual(1);
    expect(spine.reachedRoot).toBe(false);
  });

  it("focus が events に無ければ focus は undefined", () => {
    // 捕まえる変異: 例外を投げる —— まだ届いていないだけの id で
    // カラムごと落ちる。
    const spine = threadSpine([note("1")], id("9"));
    expect(spine.focus).toBeUndefined();
    expect(spine.ancestors).toEqual([]);
    expect(spine.replies).toEqual([]);
  });
});
