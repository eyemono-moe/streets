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

export type SettingEntry = SearchEntry & {
  page: SettingPage;
  /** 画面に結果を出すときにログインが必要か。保存先とは別の条件。 */
  requiresSignIn: boolean;
  /** 編集欄のない説明・案内は検索結果へ出さない。 */
  searchable?: boolean;
};

const account = (
  id: string,
  title: string,
  page: SettingPage,
  keywords: string[] = [],
): SettingEntry => ({
  id,
  title,
  page,
  section: pageNames[page],
  keywords,
  requiresSignIn: true,
});
const device = (
  id: string,
  title: string,
  page: SettingPage,
  keywords: string[] = [],
): SettingEntry => ({
  id,
  title,
  page,
  section: pageNames[page],
  keywords,
  requiresSignIn: false,
});

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

/** 設定画面の各項目が参照する検索情報。表示名もここを正とする。 */
export const settings = {
  profile: {
    ...account("profile", "プロフィール", "account"),
    searchable: false,
  },
  profileDisplayName: account("profile.display-name", "表示名", "account", [
    "プロフィール名",
    "名前",
  ]),
  profileName: account("profile.name", "ユーザー名", "account", ["ハンドル"]),
  profileAbout: account("profile.about", "自己紹介", "account", [
    "プロフィール文",
    "bio",
  ]),
  profilePicture: {
    ...account("profile.picture", "アイコン画像", "account", [
      "プロフィール画像",
      "アバター",
    ]),
    description: "プロフィールに表示する画像",
  },
  profileBanner: account("profile.banner", "ヘッダー画像", "account", [
    "バナー画像",
  ]),
  profileNip05: account(
    "profile.nip05",
    "ドメインでの本人確認（NIP-05）",
    "account",
    ["認証", "ドメイン"],
  ),
  profileWebsite: account("profile.website", "Web サイト", "account", [
    "URL",
    "ホームページ",
  ]),
  profileLud16: account(
    "profile.lud16",
    "Zap の受け取り先（ライトニングアドレス）",
    "account",
    ["投げ銭", "ウォレット"],
  ),
  accountId: {
    ...account("account.id", "あなたの ID", "account", ["公開鍵", "npub"]),
    searchable: false,
  },
  relays: account("relays", "使うリレー", "relays", [
    "接続先",
    "投稿先",
    "読むリレー",
  ]),
  blockedRelays: account("relays.blocked", "繋がないリレー", "relays", [
    "ブロック",
    "接続拒否",
  ]),
  relayRecommendations: {
    ...account("relays.recommendations", "おすすめのリレー", "relays"),
    searchable: false,
  },
  readRouting: account("relays.read-routing", "投稿を読むリレー", "relays", [
    "読み取り",
    "ルーティング",
  ]),
  relayPlan: {
    ...account("relays.plan", "いま使っているリレー", "relays"),
    searchable: false,
  },
  imageDisplay: account("media.display", "画像の表示", "media", [
    "画像を縮める",
    "メモリ",
  ]),
  imageUpload: account("media.upload", "画像のアップロード先", "media", [
    "Blossom",
    "サーバー",
  ]),
  searchRelays: account("search.relays", "検索するリレー", "search", [
    "検索先",
  ]),
  reactionEmoji: account("emoji.reaction", "いいねボタンの絵文字", "emoji", [
    "リアクション",
  ]),
  emojiList: account("emoji.list", "自分の絵文字リスト", "emoji"),
  emojiFind: {
    ...account("emoji.find", "絵文字セットを探す", "emoji"),
    searchable: false,
  },
  emojiManage: {
    ...account("emoji.manage", "もっと絵文字を管理する", "emoji"),
    searchable: false,
  },
  muteAdd: account("mute.add", "ミュートを足す", "mute", ["非表示"]),
  muteList: account("mute.list", "ミュートしているもの", "mute", [
    "非表示",
    "解除",
  ]),
  shortcuts: device("keyboard.shortcuts", "ショートカットキー", "keyboard", [
    "キー割り当て",
  ]),
  columnDigits: device(
    "keyboard.column-digits",
    "数字キーでのカラム移動",
    "keyboard",
    ["カラム切替"],
  ),
  theme: device("display.theme", "カラーテーマ", "display", [
    "ダークモード",
    "ライトモード",
  ]),
  accent: device("display.accent", "アクセントカラー", "display", [
    "色",
    "テーマ",
  ]),
  preview: {
    ...device("display.preview", "プレビュー", "display"),
    searchable: false,
  },
  deckLayout: device("display.deck-layout", "カラムの並べ方", "display", [
    "レイアウト",
    "1列",
    "複数列",
  ]),
  columnWidth: device("display.column-width", "カラムの幅", "display", [
    "column width",
    "横幅",
    "広げる",
  ]),
  contentWarning: device(
    "display.content-warning",
    "閲覧注意の投稿",
    "display",
    ["センシティブ", "警告"],
  ),
  writeProgress: device(
    "display.write-progress",
    "ローディング表示",
    "display",
    ["保存の進み具合", "アップロード"],
  ),
  actionLayout: device("display.action-layout", "アクション欄", "display", [
    "投稿の操作",
    "並べ替え",
  ]),
  clientTag: device(
    "privacy.client-tag",
    "使用しているアプリの表示",
    "privacy",
    ["client tag", "クライアント"],
  ),
  errorReport: device(
    "privacy.error-report",
    "不具合と動作の速さの報告",
    "privacy",
    ["エラー報告", "計測"],
  ),
} as const;

export type SettingId = keyof typeof settings;

export type RegisteredSetting = SettingEntry & { key: SettingId };

const entries: RegisteredSetting[] = Object.entries(settings).map(
  ([key, setting]) => ({ ...setting, key: key as SettingId }),
);

export const availableSettings = (signedIn: boolean): RegisteredSetting[] =>
  entries.filter(
    (entry) =>
      entry.searchable !== false && (signedIn || !entry.requiresSignIn),
  );
