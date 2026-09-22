import shortcodesUrl from "emojibase-data/en/shortcodes/iamcal.json?url";
import dataUrl from "emojibase-data/ja/compact.json?url";

/**
 * ピッカーに並べる絵文字。Unicode の絵文字と、誰かが作ったカスタム絵文字の
 * 2 種類がある（送るときの形が違う）。
 */
export type PickerEmoji =
  | {
      kind: "unicode";
      char: string;
      /** 日本語の名前。 */
      label: string;
      tags: readonly string[];
      /** 英語のショートコード（Slack などと同じ綴り）。 */
      shortcodes: readonly string[];
    }
  | { kind: "custom"; shortcode: string; url: string };

export type PickerGroup = {
  id: string;
  title: string;
  emojis: PickerEmoji[];
};

/**
 * emojibase のグループ番号に付ける名前。2（肌色などの部品）は単体では使わない
 * ので出さない。
 */
const GROUP_TITLES: Record<number, string> = {
  0: "顔と気持ち",
  1: "人と体",
  3: "動物と自然",
  4: "食べ物と飲み物",
  5: "旅行と場所",
  6: "アクティビティ",
  7: "もの",
  8: "記号",
  9: "旗",
};

type CompactEmoji = {
  group?: number;
  hexcode: string;
  label: string;
  order?: number;
  tags?: string[];
  unicode: string;
};

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const build = (
  data: CompactEmoji[],
  shortcodes: Record<string, string | string[]>,
): PickerGroup[] => {
  const byGroup = new Map<number, { emoji: PickerEmoji; order: number }[]>();
  for (const entry of data) {
    if (entry.group === undefined || GROUP_TITLES[entry.group] === undefined) {
      continue;
    }
    const list = byGroup.get(entry.group) ?? [];
    list.push({
      order: entry.order ?? 0,
      emoji: {
        kind: "unicode",
        char: entry.unicode,
        label: entry.label,
        tags: entry.tags ?? [],
        shortcodes: asArray(shortcodes[entry.hexcode]),
      },
    });
    byGroup.set(entry.group, list);
  }
  return Object.entries(GROUP_TITLES)
    .map(([group, title]) => ({ group: Number(group), title }))
    .filter(({ group }) => byGroup.has(group))
    .map(({ group, title }) => ({
      id: `unicode-${group}`,
      title,
      emojis: (byGroup.get(group) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.emoji),
    }));
};

let loading: Promise<PickerGroup[]> | undefined;

/**
 * Unicode の絵文字の一覧。1949 件あって小さくないので、ピッカーを初めて開いた
 * ときに読む。2 回目からは読んだものを使い回す。
 */
export const loadUnicodeEmojis = (): Promise<PickerGroup[]> => {
  if (!loading) {
    loading = (async () => {
      const [data, shortcodes] = await Promise.all([
        fetch(dataUrl).then(
          (response) => response.json() as Promise<CompactEmoji[]>,
        ),
        fetch(shortcodesUrl).then(
          (response) =>
            response.json() as Promise<Record<string, string | string[]>>,
        ),
      ]);
      return build(data, shortcodes);
    })();
    // 読めなかったときに、次に開いたらもう一度試せるようにする。
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
};
