import { parseSearchQuery } from "../search/query";
import type { ColumnDef, ColumnShow } from "./deck";
import { NOTIFICATION_KINDS, TIMELINE_KINDS } from "./deck";

/** 「表示するもの」で切り替えられる項目。 */
export type ColumnFacet = keyof ColumnShow;

/**
 * そのカラムに流れうる kind。`literal` はフィルタに書かれた kind を読む
 * （ハッシュタグ・グローバル・検索はすべて `literal` なので、種類だけでは決まらない）。
 * `undefined` は「決められない」で、呼び出し側は全項目を出す。
 */
const kindsOf = (column: ColumnDef): number[] | undefined => {
  const source = column.source;
  switch (source.kind) {
    case "followees":
      return source.kinds;
    case "notifications":
      return [...NOTIFICATION_KINDS];
    case "thread":
      return [1];
    case "activity":
      return [];
    case "user":
      return [...TIMELINE_KINDS];
    case "followees-list":
    case "followers-list":
      return [3];
    case "bookmarks":
      // id で引くので kind は決まらない。何を保存したかは人による。
      return undefined;
    case "search": {
      // 書いた条件で決まる。`kind:` を指定していなければテキストノート。
      const kinds = parseSearchQuery(source.query).kinds;
      return kinds.length > 0 ? kinds : [1];
    }
    default: {
      const kinds = source.filters.flatMap((filter) => filter.kinds ?? []);
      // kinds を持たないフィルタは「その他すべて」なので決められない。
      return source.filters.every((filter) => filter.kinds !== undefined)
        ? kinds
        : undefined;
    }
  }
};

/**
 * そのカラムで意味のある項目だけを返す。切っても何も起きない項目を設定に
 * 出さないための判断で、順番は設定画面の並びに合わせてある。
 */
export const columnFacets = (column: ColumnDef): ColumnFacet[] => {
  const kinds = kindsOf(column);
  const has = (kind: number) => kinds === undefined || kinds.includes(kind);
  const facets: ColumnFacet[] = [];
  if (has(1)) {
    facets.push("replies", "quotes");
    // メンションは「自分宛だが返信でも引用でもない投稿」。自分宛を集めるカラムでしか意味を持たない。
    if (column.source.kind === "notifications") facets.push("mentions");
  }
  if (has(6) || has(16)) facets.push("reposts");
  if (has(7)) facets.push("reactions");
  // Zap は誰かの通知にしか流れない（kind を決められないカラムにも出さない）。
  if (kinds?.includes(9735)) facets.push("zaps");
  return facets;
};
