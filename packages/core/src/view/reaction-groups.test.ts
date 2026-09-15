import { describe, expect, it } from "vitest";
import type { ParsedReaction } from "../nostr/reaction";
import { groupReactions } from "./reaction-groups";

const TARGET = "a".repeat(64);
const entry = (pubkey: string, parsed: ParsedReaction) => ({ pubkey, parsed });
const like: ParsedReaction = { content: { type: "like" }, targetId: TARGET };
const text = (content: string): ParsedReaction => ({
  content: { type: "text", content },
  targetId: TARGET,
});
const emoji = (name: string, url: string): ParsedReaction => ({
  content: { type: "emoji", name, url },
  targetId: TARGET,
});

describe("groupReactions", () => {
  it("同じ内容がまとまり件数が合う", () => {
    // 捕まえる変異: グループ化せず 1 件 1 グループにする
    const groups = groupReactions([
      entry("u1", like),
      entry("u2", like),
      entry("u3", text("🎉")),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.content.type === "like")?.count).toBe(2);
  });

  it("同じ人が 2 回押したら 1 グループの中で 2 と数える", () => {
    // 捕まえる変異: users を Set にする (回数が落ちる) / 2 グループに割る
    const groups = groupReactions([entry("u1", like), entry("u1", like)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.users.get("u1")).toBe(2);
    expect(groups[0]?.count).toBe(2);
  });

  it("emoji と text が同じ文字列でも混ざらない", () => {
    // 捕まえる変異: 鍵に type を含めず文字列だけで引く（絵文字 `:smile:` とテキスト "smile" が同じ山になる）。
    const groups = groupReactions([
      entry("u1", emoji("smile", "https://example.com/smile.png")),
      entry("u2", text("smile")),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("名前が同じで URL が違う emoji は 1 つにまとまる", () => {
    // 捕まえる変異: 鍵に URL を含める（別ドメインの同じショートコードで山が割れ数が読めなくなる）。
    const groups = groupReactions([
      entry("u1", emoji("smile", "https://a.example/s.png")),
      entry("u2", emoji("smile", "https://b.example/s.png")),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
  });

  it("空の入力では空の配列", () => {
    // 捕まえる変異: 空でもグループを 1 つ作る (0 件の枠が画面に出る)
    expect(groupReactions([])).toEqual([]);
  });

  it("最初に現れた順に並ぶ", () => {
    // 捕まえる変異: Map の挿入順を壊す並べ替えを入れる（並びが変わるたび既存の山が横に飛ぶ）。
    const groups = groupReactions([
      entry("u1", text("🎉")),
      entry("u2", like),
      entry("u3", text("🎉")),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["text:🎉", "like"]);
  });
});
