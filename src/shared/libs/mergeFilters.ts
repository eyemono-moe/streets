import type { LazyFilter } from "rx-nostr";
import { stringify } from "safe-stable-stringify";

const indexForFilter = (filter: LazyFilter, key: string): string => {
  const new_filter = { ...filter };
  // @ts-ignore
  delete new_filter[key];
  return key + stringify(new_filter);
};

// Combines filters that are similar, and removes empty filters
// Similarity is defined as having the same values for all keys except one
export const mergeSimilarAndRemoveEmptyFilters = (
  filters: LazyFilter[],
): LazyFilter[] => {
  const r = [];
  const indexByFilter = new Map<string, number>();
  const sets = [];
  for (const filter of filters) {
    let added = false;
    for (const key in filter) {
      // valueが配列であるkeyの場合
      if (
        filter[key as keyof typeof filter] &&
        // TODO: 全kindのイベントをパースできるようになったらkindsの値も比較対象にする
        (["ids", "authors"].includes(key) || key.startsWith("#"))
      ) {
        // 配列の長さが0の場合無視する
        // @ts-ignore
        if (filter[key].length === 0) {
          added = true;
          break;
        }
        const index_by = indexForFilter(filter, key);
        const index = indexByFilter.get(index_by);
        if (index !== undefined) {
          // @ts-ignore
          const extendedFilter = r[index];
          // remove all other groupings for r[index]
          for (const key2 in extendedFilter) {
            if (key2 !== key) {
              const index_by2 = indexForFilter(extendedFilter, key2);
              indexByFilter.delete(index_by2);
            }
          }
          // // @ts-ignore
          // if (!r[index][key]?.includes(filter[key])) {
          //   // @ts-ignore
          //   r[index][key].push(filter[key]);
          // }
          if (r[index][key] instanceof Set) {
            // @ts-ignore
            for (const v of filter[key]) {
              // @ts-ignore
              r[index][key].add(v);
            }
          } else {
            // @ts-ignore
            r[index][key] = new Set(r[index][key].concat(filter[key]));
            sets.push([index, key]);
          }
          added = true;
          break;
        }
      }
    }
    if (!added) {
      for (const key in filter) {
        if (
          filter[key as keyof typeof filter] &&
          // TODO: 全kindのイベントをパースできるようになったらkindsの値も比較対象にする
          (["ids", "authors"].includes(key) || key.startsWith("#"))
        ) {
          const index_by = indexForFilter(filter, key);
          indexByFilter.set(index_by, r.length);
        }
      }
      r.push({ ...filter });
    }
  }
  for (const [index, key] of sets) {
    // @ts-ignore
    r[index][key] = Array.from(r[index][key]);
  }
  return r;
};
