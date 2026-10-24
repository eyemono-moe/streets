import type { UnicodeEmojiRow } from "../../emoji-data-plugin";
import { t } from "../i18n/locale";

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

type GroupName =
  | "smileys"
  | "people"
  | "animals"
  | "food"
  | "travel"
  | "activities"
  | "objects"
  | "symbols"
  | "flags";

/**
 * emojibase のグループ番号に付ける名前とアイコン。2（肌色などの部品）は単体では
 * 使わないので出さない。
 */
const GROUPS: Record<number, { name: GroupName; icon: string }> = {
  0: {
    name: "smileys",
    icon: "i-material-symbols:sentiment-satisfied-outline-rounded",
  },
  1: { name: "people", icon: "i-material-symbols:emoji-people-rounded" },
  3: {
    name: "animals",
    icon: "i-material-symbols:pets",
  },
  4: {
    name: "food",
    icon: "i-material-symbols:fastfood-outline-rounded",
  },
  5: {
    name: "travel",
    icon: "i-material-symbols:emoji-transportation-outline-rounded",
  },
  6: {
    name: "activities",
    icon: "i-material-symbols:sports-tennis-outline-rounded",
  },
  7: {
    name: "objects",
    icon: "i-material-symbols:emoji-objects-outline-rounded",
  },
  8: { name: "symbols", icon: "i-material-symbols:emoji-symbols-rounded" },
  9: { name: "flags", icon: "i-material-symbols:flag-outline-rounded" },
};

const build = (rows: readonly UnicodeEmojiRow[]): PickerGroup[] => {
  const byGroup = new Map<number, PickerEmoji[]>();
  // 並び順は emoji-data-plugin が決めてある。
  for (const [group, char, label, tags, shortcodes] of rows) {
    if (GROUPS[group] === undefined) continue;
    const list = byGroup.get(group) ?? [];
    list.push({ kind: "unicode", char, label, tags, shortcodes });
    byGroup.set(group, list);
  }
  return Object.entries(GROUPS)
    .map(([group, meta]) => ({ group: Number(group), ...meta }))
    .filter(({ group }) => byGroup.has(group))
    .map(({ group, name, icon }) => ({
      id: `unicode-${group}`,
      // 一覧は読み込んだ結果を使い回すので、題名は読むたびに引く。値で持つと、
      // 言語を切り替えても変わらない。
      get title() {
        return t(`emoji.groups.${name}`);
      },
      icon,
      emojis: byGroup.get(group) ?? [],
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
    loading = import("virtual:unicode-emojis").then((module) =>
      build(module.default),
    );
    // 読めなかったときに、次に開いたらもう一度試せるようにする。
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
};
