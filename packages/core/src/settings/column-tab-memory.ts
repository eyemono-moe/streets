import * as v from "valibot";

/**
 * カラムで開いていたタブ。端末ごとに覚える —— デッキと一緒にアカウントへ置くと、
 * タブを切り替えるたびにデッキをリレーへ書き直すことになる。
 */
export const COLUMN_TAB_MEMORY_STORAGE_KEY = "streets.v1.columnTabs";

/** カラム id・タブの並びの名前・開いていたタブ。後ろほど最近。 */
export type ColumnTabMemory = readonly (readonly [
  column: string,
  tabs: string,
  value: string,
])[];

/**
 * 覚えておく件数。消したカラムの分を掃除する場所が無いので、古いものから捨てる。
 * デッキに並ぶカラムの数よりは十分に多い。
 */
const MAX_ENTRIES = 200;

const schema = v.array(v.tuple([v.string(), v.string(), v.string()]));

/** 未保存・読めない値は、何も覚えていないとして扱う。 */
export const loadColumnTabMemory = (raw: string | null): ColumnTabMemory => {
  if (raw === null) return [];
  try {
    const parsed = v.safeParse(schema, JSON.parse(raw));
    return parsed.success ? parsed.output : [];
  } catch {
    return [];
  }
};

export const saveColumnTabMemory = (memory: ColumnTabMemory): string =>
  JSON.stringify(memory);

export const recalledColumnTab = (
  memory: ColumnTabMemory,
  column: string,
  tabs: string,
): string | undefined =>
  memory.find((entry) => entry[0] === column && entry[1] === tabs)?.[2];

export const rememberColumnTab = (
  memory: ColumnTabMemory,
  column: string,
  tabs: string,
  value: string,
): ColumnTabMemory => [
  ...memory
    .filter((entry) => entry[0] !== column || entry[1] !== tabs)
    .slice(-(MAX_ENTRIES - 1)),
  [column, tabs, value],
];
