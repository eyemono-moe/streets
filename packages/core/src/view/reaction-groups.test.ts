import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { ParsedReaction } from "../nostr/reaction";
import {
  eventReactionGroups,
  groupReactions,
  sameReactionGroups,
} from "./reaction-groups";

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

const reactionEvent = (
  pubkey: string,
  content: string,
  tags: string[][],
): NostrEvent => ({
  id: `${pubkey}${content}`.padEnd(64, "0"),
  pubkey,
  created_at: 0,
  kind: 7,
  tags,
  content,
  sig: "",
});

describe("eventReactionGroups", () => {
  it("最後の e タグが対象のものだけを数える", () => {
    const other = "b".repeat(64);
    const events = [
      reactionEvent("u1", "🎉", [["e", TARGET]]),
      // 返信への反応で、TARGET は祖先として前に並んでいるだけ。
      reactionEvent("u2", "🎉", [
        ["e", TARGET],
        ["e", other],
      ]),
    ];
    const groups = eventReactionGroups({ eventsByTag: () => events }, TARGET);
    expect(groups.map((group) => [group.key, group.count])).toEqual([
      ["text:🎉", 1],
    ]);
  });
});

describe("sameReactionGroups", () => {
  it("押した人の回数まで同じなら同じとみなす", () => {
    const build = () =>
      groupReactions([entry("u1", like), entry("u2", text("🎉"))]);
    expect(sameReactionGroups(build(), build())).toBe(true);
  });

  it("同じ件数でも押した人が違えば別物", () => {
    expect(
      sameReactionGroups(
        groupReactions([entry("u1", like)]),
        groupReactions([entry("u2", like)]),
      ),
    ).toBe(false);
  });
});
