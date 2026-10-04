import type { SearchEntry } from "@streets/core/signal/search";

export type SettingPage =
  | "account"
  | "relays"
  | "media"
  | "search"
  | "emoji"
  | "mute"
  | "keyboard"
  | "display"
  | "privacy";

export const pageNames: Record<SettingPage, string> = {
  account: "アカウント",
  relays: "リレー",
  media: "画像",
  search: "検索",
  emoji: "絵文字",
  mute: "ミュート",
  keyboard: "キーボード",
  display: "表示",
  privacy: "プライバシー",
};

/** アカウントに保存するページ。ログインしていなければ読む先も書く先も無い。 */
export const ACCOUNT_PAGES: ReadonlySet<SettingPage> = new Set([
  "account",
  "relays",
  "media",
  "search",
  "emoji",
  "mute",
]);

type SettingInfo = Omit<SearchEntry, "id"> & {
  page: SettingPage;
  /** 編集欄のない説明・案内は検索結果へ出さない。 */
  searchable?: boolean;
  /** プロフィールの欄。検索ではプロフィールの項目からその欄だけを、欄の名前を見出しにして出す。 */
  within?: "profile";
};

const setting = (
  title: string,
  page: SettingPage,
  keywords: string[] = [],
): SettingInfo => ({ title, page, section: pageNames[page], keywords });

const profileField = (title: string, keywords: string[]): SettingInfo => ({
  ...setting(title, "account", keywords),
  within: "profile",
});

/** 設定画面の各項目が参照する検索情報。表示名もここを正とする。 */
export const settings = {
  profile: {
    ...setting("プロフィール", "account"),
    searchable: false,
  },
  profileDisplayName: profileField("表示名", ["プロフィール名", "名前"]),
  profileName: profileField("ユーザー名", ["ハンドル"]),
  profileAbout: {
    ...profileField("自己紹介", ["プロフィール文", "bio"]),
    description: "ほかの人に見えるプロフィールの文章",
  },
  profilePicture: {
    ...profileField("アイコン画像", ["プロフィール画像", "アバター"]),
    description: "プロフィールに表示する画像",
  },
  profileBanner: profileField("ヘッダー画像", ["バナー画像"]),
  profileNip05: profileField("ドメインでの本人確認（NIP-05）", [
    "認証",
    "ドメイン",
  ]),
  profileWebsite: profileField("Web サイト", ["URL", "ホームページ"]),
  profileLud16: profileField("Zap の受け取り先（ライトニングアドレス）", [
    "投げ銭",
    "ウォレット",
  ]),
  accountId: {
    ...setting("あなたの ID", "account", ["公開鍵", "npub"]),
    searchable: false,
  },
  relays: setting("使うリレー", "relays", ["接続先", "投稿先", "読むリレー"]),
  blockedRelays: setting("繋がないリレー", "relays", ["ブロック", "接続拒否"]),
  relayRecommendations: {
    ...setting("おすすめのリレー", "relays"),
    searchable: false,
  },
  readRouting: setting("投稿を読むリレー", "relays", [
    "読み取り",
    "ルーティング",
  ]),
  relayPlan: {
    ...setting("いま使っているリレー", "relays"),
    searchable: false,
  },
  imageDisplay: {
    ...setting("画像の表示", "media", ["画像を縮める", "メモリ"]),
    description: "画像を画面に合う大きさに縮め、メモリの使用を減らす",
  },
  imageUpload: {
    ...setting("画像のアップロード先", "media", ["Blossom", "サーバー"]),
    description: "投稿に付ける画像を置くサーバー",
  },
  searchRelays: setting("検索するリレー", "search", ["検索先"]),
  reactionEmoji: setting("いいねボタンの絵文字", "emoji", ["リアクション"]),
  emojiList: setting("自分の絵文字リスト", "emoji"),
  emojiFind: {
    ...setting("絵文字セットを探す", "emoji"),
    searchable: false,
  },
  emojiManage: {
    ...setting("もっと絵文字を管理する", "emoji"),
    searchable: false,
  },
  muteAdd: setting("ミュートを足す", "mute", ["非表示"]),
  muteList: setting("ミュートしているもの", "mute", ["非表示", "解除"]),
  shortcuts: setting("ショートカットキー", "keyboard", ["キー割り当て"]),
  columnDigits: setting("数字キーでのカラム移動", "keyboard", ["カラム切替"]),
  theme: {
    ...setting("カラーテーマ", "display", ["ダークモード", "ライトモード"]),
    description: "画面を明るい色にするか暗い色にするか選ぶ",
  },
  accent: setting("アクセントカラー", "display", ["色", "テーマ"]),
  preview: {
    ...setting("プレビュー", "display"),
    searchable: false,
  },
  deckLayout: {
    ...setting("カラムの並べ方", "display", ["レイアウト", "1列", "複数列"]),
    description: "カラムを横に並べるか一列ずつ切り替えるかを選ぶ",
  },
  columnWidth: {
    ...setting("カラムの幅", "display", ["column width", "横幅", "広げる"]),
    description: "横に並べたカラムを画面の幅いっぱいに広げる",
  },
  contentWarning: setting("閲覧注意の投稿", "display", [
    "センシティブ",
    "警告",
  ]),
  writeProgress: setting("ローディング表示", "display", [
    "保存の進み具合",
    "アップロード",
  ]),
  actionLayout: setting("アクション欄", "display", ["投稿の操作", "並べ替え"]),
  clientTag: setting("使用しているアプリの表示", "privacy", [
    "client tag",
    "クライアント",
  ]),
  errorReport: setting("不具合と動作の速さの報告", "privacy", [
    "エラー報告",
    "計測",
  ]),
} as const;

export type SettingId = keyof typeof settings;

export type SettingEntry = SettingInfo & { id: SettingId };

const entries: SettingEntry[] = Object.entries(settings).map(([id, info]) => ({
  ...info,
  id: id as SettingId,
}));

export const availableSettings = (signedIn: boolean): SettingEntry[] =>
  entries.filter(
    (entry) =>
      entry.searchable !== false &&
      (signedIn || !ACCOUNT_PAGES.has(entry.page)),
  );
