import { lazyPart } from "../lazy-part";

/**
 * 絵文字ピッカーの中身。投稿ごとにピッカーの入口があるが、開くまで中身は要らない
 * （スクロールや目次の部品ごと重い）。起動が落ち着いたら読んでおく。
 */
export const EmojiPicker = lazyPart(() => import("./EmojiPicker"));
