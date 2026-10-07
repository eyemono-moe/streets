/**
 * チャットの発言を、新しいものを下に足して並べるか、上に足して並べるか。
 * 端末ごとの設定。
 */
export type ChatOrder = "newest-last" | "newest-first";

export const CHAT_ORDER_STORAGE_KEY = "streets.v1.chatOrder";

/** 未保存・読めない値は、ふつうのチャットと同じく新しいものを下にする。 */
export const loadChatOrder = (raw: string | null): ChatOrder =>
  raw === "newest-first" ? raw : "newest-last";
