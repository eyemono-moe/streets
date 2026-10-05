import type { ColumnPresetKind } from "@streets/core/deck/column-presets";
import type { ColumnPicker } from "@streets/core/deck/deck-ui";

type ColumnAddPreset = {
  kind: ColumnPresetKind | ColumnPicker;
  label: string;
  description: string;
  icon: string;
  /** コマンドパレットで探すときの別の言い方。 */
  keywords: string[];
};

/** カラムの追加パネルとコマンドパレットに並べる、足せるカラムの種類。 */
export const COLUMN_ADD_PRESETS: readonly ColumnAddPreset[] = [
  {
    kind: "home",
    label: "ホーム",
    description: "フォロー中のノートとリポスト",
    icon: "i-material-symbols:home-outline-rounded",
    keywords: ["タイムライン", "フォロー中"],
  },
  {
    kind: "notifications",
    label: "通知",
    description: "自分宛の返信・リアクション・リポスト",
    icon: "i-material-symbols:notifications-outline-rounded",
    keywords: ["返信", "リアクション"],
  },
  {
    kind: "followees-activity",
    label: "みんなのアクティビティ",
    description: "フォロー中の人のリアクション・リポスト",
    icon: "i-material-symbols:vital-signs-rounded",
    keywords: ["アクティビティ", "TweetDeck", "いいね", "ふぁぼ"],
  },
  {
    kind: "relay",
    label: "リレー",
    description: "選んだリレーの公開ノート",
    icon: "i-material-symbols:globe",
    keywords: ["接続先"],
  },
  {
    kind: "channels",
    label: "チャンネル",
    description: "みんなで会話できるチャットチャンネル",
    icon: "i-material-symbols:forum-outline-rounded",
    keywords: ["チャット"],
  },
  {
    kind: "bookmarks",
    label: "ブックマーク",
    description: "保存したノート",
    icon: "i-material-symbols:bookmark-outline-rounded",
    keywords: ["保存"],
  },
  {
    kind: "user",
    label: "ユーザー",
    description: "選んだ人の投稿",
    icon: "i-material-symbols:person-outline-rounded",
    keywords: ["人"],
  },
  {
    kind: "follow-sets",
    label: "リスト",
    description: "選んだ人たちの投稿",
    icon: "i-material-symbols:format-list-bulleted-rounded",
    keywords: ["フォローセット"],
  },
];
