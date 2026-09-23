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
  /**
   * 上の帯のタブに出すアイコン（`i-...`）。名前は長く、帯に並べきれないため。
   * 無ければ先頭の絵文字を出す（カスタム絵文字のかたまりは、中身で見分ける）。
   */
  icon?: string;
  emojis: PickerEmoji[];
};

/**
 * emojibase のグループ番号に付ける名前とアイコン。2（肌色などの部品）は単体では
 * 使わないので出さない。
 */
const GROUPS: Record<number, { title: string; icon: string }> = {
  0: {
    title: "顔と気持ち",
    icon: "i-material-symbols:sentiment-satisfied-outline-rounded",
  },
  1: { title: "人と体", icon: "i-material-symbols:emoji-people-rounded" },
  3: {
    title: "動物と自然",
    icon: "i-material-symbols:pets",
  },
  4: {
    title: "食べ物と飲み物",
    icon: "i-material-symbols:fastfood-outline-rounded",
  },
  5: {
    title: "旅行と場所",
    icon: "i-material-symbols:emoji-transportation-outline-rounded",
  },
  6: {
    title: "アクティビティ",
    icon: "i-material-symbols:sports-tennis-outline-rounded",
  },
  7: {
    title: "もの",
    icon: "i-material-symbols:emoji-objects-outline-rounded",
  },
  8: { title: "記号", icon: "i-material-symbols:emoji-symbols-rounded" },
  9: { title: "旗", icon: "i-material-symbols:flag-outline-rounded" },
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
    if (entry.group === undefined || GROUPS[entry.group] === undefined) {
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
  return Object.entries(GROUPS)
    .map(([group, meta]) => ({ group: Number(group), ...meta }))
    .filter(({ group }) => byGroup.has(group))
    .map(({ group, title, icon }) => ({
      id: `unicode-${group}`,
      title,
      icon,
      emojis: (byGroup.get(group) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.emoji),
    }));
};

let loading: Promise<PickerGroup[]> | undefined;

/**
 * Unicode の絵文字の一覧。1949 件あって小さくないので、起動時には読まず、
 * 投稿や返信を書き始めたとき（またはピッカーを初めて開いたとき）に読む。
 * 2 回目からは読んだものを使い回す。
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
