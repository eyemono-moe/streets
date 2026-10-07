import {
  CHAT_ORDER_STORAGE_KEY,
  type ChatOrder,
  loadChatOrder,
} from "@streets/core/settings/chat-order-setting";
import { createSignal } from "solid-js";

const read = (): ChatOrder => {
  try {
    return loadChatOrder(localStorage.getItem(CHAT_ORDER_STORAGE_KEY));
  } catch {
    return loadChatOrder(null);
  }
};

const [chatOrder, setOrder] = createSignal(read());

/** チャットの発言の並び順（この端末の設定）。 */
export { chatOrder };

export const setChatOrder = (order: ChatOrder) => {
  setOrder(order);
  try {
    localStorage.setItem(CHAT_ORDER_STORAGE_KEY, order);
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};
