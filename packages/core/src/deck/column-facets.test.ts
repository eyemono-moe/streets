import { describe, expect, it } from "vitest";
import { columnFacets } from "./column-facets";
import type { ColumnDef, ColumnSource } from "./deck";

const column = (source: ColumnSource): ColumnDef => ({
  id: "x",
  title: "x",
  source,
});

describe("columnFacets", () => {
  it("ホームはリプライ・引用・リポスト・画像を出し、リアクションとメンションは出さない", () => {
    // 捕まえる変異: 種類に関わらず全項目を出す
    expect(columnFacets(column({ kind: "followees", kinds: [1, 6] }))).toEqual([
      "replies",
      "quotes",
      "reposts",
      "media",
    ]);
  });

  it("通知だけがメンションを出す", () => {
    // 捕まえる変異: メンションをどのカラムにも出す（ホームで切ると普通の投稿が消える）
    expect(columnFacets(column({ kind: "notifications" }))).toContain(
      "mentions",
    );
    expect(columnFacets(column({ kind: "user", pubkey: "a" }))).not.toContain(
      "mentions",
    );
  });

  it("ハッシュタグ（literal）はフィルタの kinds で決まる", () => {
    // 捕まえる変異: literal をまとめて「決められない」にする（無意味な項目が出る）
    expect(
      columnFacets(
        column({ kind: "literal", filters: [{ kinds: [1], "#t": ["nostr"] }] }),
      ),
    ).toEqual(["replies", "quotes", "media"]);
  });

  it("kinds を持たないフィルタは決められないので全項目を出す", () => {
    expect(
      columnFacets(column({ kind: "literal", filters: [{ ids: ["a"] }] })),
    ).toEqual(["replies", "quotes", "reposts", "reactions", "media"]);
  });

  it("フォロー一覧（kind:3）には項目が無い", () => {
    expect(
      columnFacets(column({ kind: "followees-list", pubkey: "a" })),
    ).toEqual([]);
  });
});
