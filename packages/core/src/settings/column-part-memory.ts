import * as v from "valibot";

/** カラムのパーツを閉じた状態だけ、この端末に覚える。 */
export const COLUMN_PART_MEMORY_STORAGE_KEY = "streets.v1.columnParts";

export type ColumnPartMemory = readonly (readonly [
  column: string,
  part: string,
])[];

const MAX_ENTRIES = 200;
const schema = v.array(v.tuple([v.string(), v.string()]));

export const loadColumnPartMemory = (raw: string | null): ColumnPartMemory => {
  if (raw === null) return [];
  try {
    const parsed = v.safeParse(schema, JSON.parse(raw));
    return parsed.success ? parsed.output.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
};

export const saveColumnPartMemory = (memory: ColumnPartMemory): string =>
  JSON.stringify(memory);

export const columnPartOpen = (
  memory: ColumnPartMemory,
  column: string,
  part: string,
): boolean => !memory.some((entry) => entry[0] === column && entry[1] === part);

export const setColumnPartOpen = (
  memory: ColumnPartMemory,
  column: string,
  part: string,
  open: boolean,
): ColumnPartMemory => {
  const remaining = memory.filter(
    (entry) => entry[0] !== column || entry[1] !== part,
  );
  return open
    ? remaining
    : [...remaining.slice(-(MAX_ENTRIES - 1)), [column, part]];
};
