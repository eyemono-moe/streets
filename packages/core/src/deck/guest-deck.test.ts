import { describe, expect, it } from "vite-plus/test";
import { columnNeedsAccount } from "./column-kinds";
import { loadDeckSet, saveDeckSet } from "./deck";
import { STREETS_PUBKEY, browseTargetIn, guestDeckSet } from "./guest-deck";

describe("guestDeckSet", () => {
  const set = guestDeckSet(["wss://a.example/"]);
  const columns = set.decks[0]?.columns ?? [];

  it("紹介とログインを先頭に、ログインせずに読めるカラムを並べる", () => {
    expect(columns.map((column) => column.source.kind)).toEqual([
      "welcome",
      "literal",
      "literal",
      "user",
    ]);
    expect(columns[3]?.source).toEqual({
      kind: "user",
      pubkey: STREETS_PUBKEY,
    });
    // 捕まえる変異: ログインが要るカラム（ホーム・通知）を混ぜる
    expect(columns.some(columnNeedsAccount)).toBe(false);
  });

  it("ハッシュタグのカラムはリレーを明示しない", () => {
    // 捕まえる変異: `relays: []` を付ける（0 本の明示指定になり、何も流れない）
    expect(columns[2]?.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1], "#t": ["foodstr"] }],
    });
  });

  it("リレーが 0 本ならリレーのカラムを置かない", () => {
    const kinds = guestDeckSet([]).decks[0]?.columns.map(
      (column) => column.source.kind,
    );
    expect(kinds).toEqual(["welcome", "literal", "user"]);
  });

  it("保存して読み戻せる", () => {
    expect(loadDeckSet(saveDeckSet(set))).toEqual(set);
  });

  it("カラムの id は重ならない", () => {
    const ids = columns.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("columnNeedsAccount", () => {
  it("自分に紐づくカラムだけがログインを要る", () => {
    const of = (source: Parameters<typeof columnNeedsAccount>[0]["source"]) =>
      columnNeedsAccount({ id: "x", title: "x", source });
    expect(of({ kind: "followees", kinds: [1] })).toBe(true);
    expect(of({ kind: "notifications" })).toBe(true);
    expect(of({ kind: "bookmarks" })).toBe(true);
    expect(of({ kind: "follow-sets" })).toBe(true);
    expect(of({ kind: "user", pubkey: "a".repeat(64) })).toBe(false);
    expect(of({ kind: "search", query: "ねこ" })).toBe(false);
  });
});

describe("browseTargetIn", () => {
  const col = (
    id: string,
    source: Parameters<typeof columnNeedsAccount>[0]["source"],
  ) => ({ id, title: id, source });

  it("紹介とログインの要るカラムを飛ばし、読めるカラムへ移る", () => {
    expect(
      browseTargetIn([
        col("welcome", { kind: "welcome" }),
        col("home", { kind: "followees", kinds: [1] }),
        col("relay", {
          kind: "literal",
          filters: [{ kinds: [1] }],
          relays: ["wss://a.example/"],
        }),
      ]),
    ).toBe("relay");
  });

  it("読めるカラムが無ければ undefined", () => {
    // 捕まえる変異: 紹介のカラム自身を返す（押しても何も変わらない）
    expect(
      browseTargetIn([
        col("welcome", { kind: "welcome" }),
        col("notifications", { kind: "notifications" }),
      ]),
    ).toBeUndefined();
  });
});
