import aboutEn from "../about/i18n/en.json";
import aboutJa from "../about/i18n/ja.json";
import appEn from "../app/i18n/en.json";
import appJa from "../app/i18n/ja.json";
import articleEn from "../article/i18n/en.json";
import articleJa from "../article/i18n/ja.json";
import chatEn from "../chat/i18n/en.json";
import chatJa from "../chat/i18n/ja.json";
import columnsEn from "../columns/i18n/en.json";
import columnsJa from "../columns/i18n/ja.json";
import deckEn from "../deck/i18n/en.json";
import deckJa from "../deck/i18n/ja.json";
import emojiEn from "../emoji/i18n/en.json";
import emojiJa from "../emoji/i18n/ja.json";
import listsEn from "../lists/i18n/en.json";
import listsJa from "../lists/i18n/ja.json";
import mediaEn from "../media/i18n/en.json";
import mediaJa from "../media/i18n/ja.json";
import noteEn from "../note/i18n/en.json";
import noteJa from "../note/i18n/ja.json";
import pollEn from "../poll/i18n/en.json";
import pollJa from "../poll/i18n/ja.json";
import profileEn from "../profile/i18n/en.json";
import profileJa from "../profile/i18n/ja.json";
import settingsEn from "../settings/i18n/en.json";
import settingsJa from "../settings/i18n/ja.json";
import shareEn from "../share/i18n/en.json";
import shareJa from "../share/i18n/ja.json";
import signalEn from "../signal/i18n/en.json";
import signalJa from "../signal/i18n/ja.json";
import statusEn from "../status/i18n/en.json";
import statusJa from "../status/i18n/ja.json";
import tourEn from "../tour/i18n/en.json";
import tourJa from "../tour/i18n/ja.json";
import uiEn from "../ui/i18n/en.json";
import uiJa from "../ui/i18n/ja.json";
import welcomeEn from "../welcome/i18n/en.json";
import welcomeJa from "../welcome/i18n/ja.json";
import writeQueueEn from "../write-queue/i18n/en.json";
import writeQueueJa from "../write-queue/i18n/ja.json";
import zapEn from "../zap/i18n/en.json";
import zapJa from "../zap/i18n/ja.json";

/** 日本語の文言。キーの正。フォルダの名前を、そのフォルダの文言の頭に付ける。 */
export const ja = {
  about: aboutJa,
  app: appJa,
  article: articleJa,
  chat: chatJa,
  columns: columnsJa,
  deck: deckJa,
  emoji: emojiJa,
  lists: listsJa,
  media: mediaJa,
  note: noteJa,
  poll: pollJa,
  profile: profileJa,
  settings: settingsJa,
  share: shareJa,
  signal: signalJa,
  status: statusJa,
  tour: tourJa,
  ui: uiJa,
  welcome: welcomeJa,
  "write-queue": writeQueueJa,
  zap: zapJa,
};

export type Messages = typeof ja;

export const en: Messages = {
  about: aboutEn,
  app: appEn,
  article: articleEn,
  chat: chatEn,
  columns: columnsEn,
  deck: deckEn,
  emoji: emojiEn,
  lists: listsEn,
  media: mediaEn,
  note: noteEn,
  poll: pollEn,
  profile: profileEn,
  settings: settingsEn,
  share: shareEn,
  signal: signalEn,
  status: statusEn,
  tour: tourEn,
  ui: uiEn,
  welcome: welcomeEn,
  "write-queue": writeQueueEn,
  zap: zapEn,
};
