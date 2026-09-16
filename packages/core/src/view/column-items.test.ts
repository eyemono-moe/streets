import { describe, expect, it } from "vitest";
import type { ColumnFacet } from "../deck/column-facets";
import { DEFAULT_COLUMN_SHOW } from "../deck/deck";
import type { NostrEvent } from "../nostr/event";
import { visibleColumnItems } from "./column-items";

const ID = "a".repeat(64);

const event = (kind: number, tags: string[][] = []): NostrEvent => ({
  id: `${kind}${tags.length}`.padEnd(64, "0"),
  pubkey: "b".repeat(64),
  created_at: 0,
  kind,
  tags,
  content: "",
  sig: "",
});

const note = event(1);
const reply = event(1, [["e", ID, "", "root"]]);
const repost = event(6, [["e", ID]]);
const reaction = event(7, [["e", ID]]);
const quote = event(1, [["q", ID]]);
const replyWithQuote = event(1, [
  ["e", ID, "", "root"],
  ["q", "c".repeat(64)],
]);
const all = [note, reply, repost, reaction];
const ALL_FACETS: ColumnFacet[] = [
  "replies",
  "quotes",
  "mentions",
  "reposts",
  "reactions",
  "media",
];

describe("visibleColumnItems", () => {
  it("既定では何も落とさない", () => {
    expect(visibleColumnItems(all, DEFAULT_COLUMN_SHOW, ALL_FACETS)).toEqual(
      all,
    );
  });

  it("引用を切ると、q タグを持つ kind:1 が落ちる", () => {
    // 捕まえる変異: 引用を返信と同じ扱いにする（返信を切ると引用まで消える）
    expect(
      visibleColumnItems(
        [note, quote],
        {
          ...DEFAULT_COLUMN_SHOW,
          quotes: false,
        },
        ALL_FACETS,
      ),
    ).toEqual([note]);
    expect(
      visibleColumnItems(
        [note, quote],
        {
          ...DEFAULT_COLUMN_SHOW,
          replies: false,
        },
        ALL_FACETS,
      ),
    ).toEqual([note, quote]);
  });

  it("返信でもある引用は、返信の設定で決まる", () => {
    // 捕まえる変異: q タグを先に見る（返信を切っても会話が残り続ける）
    expect(
      visibleColumnItems(
        [replyWithQuote],
        {
          ...DEFAULT_COLUMN_SHOW,
          replies: false,
        },
        ALL_FACETS,
      ),
    ).toEqual([]);
    expect(
      visibleColumnItems(
        [replyWithQuote],
        {
          ...DEFAULT_COLUMN_SHOW,
          quotes: false,
        },
        ALL_FACETS,
      ),
    ).toEqual([replyWithQuote]);
  });

  it("返信を切ると、親を持つ kind:1 だけが落ちる", () => {
    // 捕まえる変異: kind:1 を丸ごと落とす（通常のノートまで消える）
    expect(
      visibleColumnItems(
        all,
        { ...DEFAULT_COLUMN_SHOW, replies: false },
        ALL_FACETS,
      ),
    ).toEqual([note, repost, reaction]);
  });

  it("リポストを切ると kind:6 と kind:16 が落ちる", () => {
    const generic = event(16, [["e", ID]]);
    expect(
      visibleColumnItems(
        [...all, generic],
        {
          ...DEFAULT_COLUMN_SHOW,
          reposts: false,
        },
        ALL_FACETS,
      ),
    ).toEqual([note, reply, reaction]);
  });

  it("リアクションを切ると kind:7 が落ちる", () => {
    expect(
      visibleColumnItems(
        all,
        { ...DEFAULT_COLUMN_SHOW, reactions: false },
        ALL_FACETS,
      ),
    ).toEqual([note, reply, repost]);
  });

  it("項目がそのカラムで意味を持たないときは間引かない", () => {
    // 捕まえる変異: facets を無視する（ホームで「メンション」を切ると普通の投稿が消える）
    expect(
      visibleColumnItems(
        [note, reply],
        { ...DEFAULT_COLUMN_SHOW, mentions: false },
        ["replies", "quotes"],
      ),
    ).toEqual([note, reply]);
  });
});
