import type { SearchEntry } from "@streets/core/signal/search";
import { t } from "../i18n/locale";

export type SettingPage =
  | "account"
  | "relays"
  | "media"
  | "search"
  | "emoji"
  | "mute"
  | "keyboard"
  | "display"
  | "privacy"
  | "stats";

/** 設定のページの名前。言語を切り替えると変わるので、描くところで呼ぶ。 */
export const pageName = (page: SettingPage): string =>
  t(`settings.pages.${page}`);

/** アカウントに保存するページ。ログインしていなければ読む先も書く先も無い。 */
export const ACCOUNT_PAGES: ReadonlySet<SettingPage> = new Set([
  "account",
  "relays",
  "media",
  "search",
  "emoji",
  "mute",
]);

type SettingInfo = {
  page: SettingPage;
  /** 編集欄のない説明・案内は検索結果へ出さない。 */
  searchable?: boolean;
  /** プロフィールの欄。検索ではプロフィールの項目からその欄だけを、欄の名前を見出しにして出す。 */
  within?: "profile";
};

/**
 * 設定画面の各項目と、その置き場所。名前・説明・検索の語は辞書
 * （`settings.items.<id>`）にあり、`settingTitle` などで引く。
 */
const placements = {
  profile: { page: "account", searchable: false },
  profileDisplayName: { page: "account", within: "profile" },
  profileName: { page: "account", within: "profile" },
  profileAbout: { page: "account", within: "profile" },
  profilePicture: { page: "account", within: "profile" },
  profileBanner: { page: "account", within: "profile" },
  profileNip05: { page: "account", within: "profile" },
  profileWebsite: { page: "account", within: "profile" },
  profileLud16: { page: "account", within: "profile" },
  accountId: { page: "account", searchable: false },
  relays: { page: "relays" },
  blockedRelays: { page: "relays" },
  relayRecommendations: { page: "relays", searchable: false },
  readRouting: { page: "relays" },
  readRedundancy: { page: "relays" },
  fallbackRelays: { page: "relays" },
  relayPlan: { page: "stats", searchable: false },
  relayTraffic: { page: "stats", searchable: false },
  imageDisplay: { page: "media" },
  imageUpload: { page: "media" },
  searchHistory: { page: "search" },
  searchRelays: { page: "search" },
  reactionEmoji: { page: "emoji" },
  emojiList: { page: "emoji" },
  emojiFind: { page: "emoji", searchable: false },
  emojiManage: { page: "emoji", searchable: false },
  muteAdd: { page: "mute" },
  muteList: { page: "mute" },
  shortcuts: { page: "keyboard" },
  columnDigits: { page: "keyboard" },
  theme: { page: "display" },
  contrast: { page: "display" },
  accent: { page: "display" },
  preview: { page: "display", searchable: false },
  deckLayout: { page: "display" },
  swipeMode: { page: "display" },
  columnWidth: { page: "display" },
  contentWarning: { page: "display" },
  chatOrder: { page: "display" },
  timeFormat: { page: "display" },
  writeProgress: { page: "display" },
  actionLayout: { page: "display" },
  clientTag: { page: "privacy" },
  notifyQuoted: { page: "privacy" },
  errorReport: { page: "privacy" },
} as const satisfies Record<string, SettingInfo>;

export type SettingId = keyof typeof placements;

export const settings: Record<SettingId, SettingInfo> = placements;

export type SettingEntry = SearchEntry & SettingInfo & { id: SettingId };

/** 項目の名前・説明・検索の語。言語を切り替えると変わるので、描くところで呼ぶ。 */
export const settingTitle = (id: SettingId): string =>
  t(`settings.items.${id}.title`);

const settingEntry = (id: SettingId): SettingEntry => {
  const info = settings[id];
  const item = t(`settings.items.${id}`);
  return {
    ...info,
    id,
    title: item.title,
    description: "description" in item ? item.description : undefined,
    keywords: item.keywords,
    section: pageName(info.page),
  };
};

export const availableSettings = (signedIn: boolean): SettingEntry[] =>
  (Object.keys(settings) as SettingId[])
    .map(settingEntry)
    .filter(
      (entry) =>
        entry.searchable !== false &&
        (signedIn || !ACCOUNT_PAGES.has(entry.page)),
    );
