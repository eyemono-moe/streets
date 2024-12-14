/**
 * 一致するキーの一覧を返す
 * priorityが0のとき完全一致
 * 1のとき前方一致
 * 2のとき部分一致
 *
 * @param arr 検索対象のキーの配列
 * @param query lowercaseになっているクエリ
 * @param f キーから検索対象の文字列を取得する関数
 */
export const getMatchedWithPriority = <T>(
  arr: readonly T[],
  query: string,
  f: (v: T) => (string | undefined)[],
): { value: T; priority: number }[] => {
  const matchedValuesMap = new Map<T, { value: T; priority: number }>();

  for (const val of arr) {
    const valLowers = f(val)
      .filter((v) => v !== undefined)
      .map((v) => v.toLowerCase());
    for (const valLower of valLowers) {
      const p = matchedValuesMap.get(val)?.priority ?? 100;
      if (valLower === query && p > 0) {
        matchedValuesMap.set(val, { value: val, priority: 0 });
      } else if (valLower.startsWith(query) && p > 1) {
        matchedValuesMap.set(val, { value: val, priority: 1 });
      } else if (valLower.includes(query) && p > 2) {
        matchedValuesMap.set(val, { value: val, priority: 2 });
      }
    }
  }

  return [...matchedValuesMap.values()];
};
