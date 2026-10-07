import { lazyPart } from "../lazy-part";
import { loadUnicodeEmojis } from "./emoji-data";

/**
 * 絵文字ピッカーの中身。投稿ごとにピッカーの入口があるが、開くまで中身は要らない
 * （スクロールや目次の部品ごと重い）。起動が落ち着いたら読んでおく。
 */
export const EmojiPicker = lazyPart(() => import("./EmojiPicker"));

/** リアクションのピッカーの下端と、「調整する」で開くダイアログ。描く処理を含む。 */
export const MakerFooter = lazyPart(() => import("./maker/MakerFooter"));
export const MakerDialog = lazyPart(() => import("./maker/MakerDialog"));

/**
 * ピッカーを開くのに要るものを全部読んでおく。部品だけでなく Unicode の絵文字の
 * 一覧（約 180KB）も読む —— 開いてから取りに行くと、一覧が出るまで待たせる。
 */
export const preloadEmojiPicker = () => {
  EmojiPicker.preload();
  MakerFooter.preload();
  MakerDialog.preload();
  loadUnicodeEmojis().catch(() => {
    // 読めなくても、開いたときにもう一度取りに行く。
  });
};
