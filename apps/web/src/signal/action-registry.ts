import { SHORTCUT_LABELS } from "@streets/core/settings/keymap";
import type { SearchEntry } from "@streets/core/signal/search";
import type { UiEvent } from "../ui-events";

export type PaletteAction = SearchEntry & {
  kind: "action";
  event: UiEvent;
  requiresSignIn?: boolean;
};

/** 対象を指定せずに開ける UI の入口だけを登録する。 */
const actions: readonly PaletteAction[] = [
  {
    id: "compose",
    kind: "action",
    title: SHORTCUT_LABELS.compose,
    section: "操作",
    keywords: ["新規投稿", "書く", "ノート"],
    shortcodes: ["compose"],
    event: { type: "deck/open-panel", panel: "compose" },
    requiresSignIn: true,
  },
  {
    id: "search",
    kind: "action",
    title: SHORTCUT_LABELS.search,
    section: "操作",
    keywords: ["投稿を探す", "検索"],
    shortcodes: ["search"],
    event: { type: "deck/open-panel", panel: "search" },
  },
  {
    id: "add-column",
    kind: "action",
    title: SHORTCUT_LABELS["add-column"],
    section: "操作",
    keywords: ["カラムを増やす", "列を追加"],
    shortcodes: ["add-column"],
    event: { type: "deck/open-panel", panel: "add-column" },
  },
  {
    id: "arrange",
    kind: "action",
    title: "デッキを編集する",
    section: "操作",
    keywords: ["カラムの並べ替え", "デッキ", "整理"],
    shortcodes: ["arrange"],
    event: { type: "deck/open-panel", panel: "arrange" },
  },
  {
    id: "settings",
    kind: "action",
    title: "設定を開く",
    section: "操作",
    keywords: ["環境設定", "カスタマイズ"],
    shortcodes: ["settings"],
    event: { type: "deck/open-settings" },
  },
  {
    id: "about",
    kind: "action",
    title: "Streets についてを見る",
    section: "操作",
    keywords: ["アプリの情報", "使い方", "案内"],
    shortcodes: ["about"],
    event: { type: "deck/open-about" },
  },
];

export const availableActions = (signedIn: boolean): PaletteAction[] =>
  actions.filter((action) => signedIn || !action.requiresSignIn);
