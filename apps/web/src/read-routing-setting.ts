import {
  READ_ROUTING_STORAGE_KEY,
  type ReadRoutingMode,
  loadReadRoutingMode,
  saveReadRoutingMode,
} from "@streets/core/settings/read-routing-setting";
import { createSignal } from "solid-js";

const read = (): ReadRoutingMode => {
  try {
    return loadReadRoutingMode(localStorage.getItem(READ_ROUTING_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、既定の Outbox で読む。
    return "outbox";
  }
};

const [readRoutingMode, setMode] = createSignal(read());

/** 投稿を読むリレーの決め方（この端末の設定）。 */
export { readRoutingMode };

export const setReadRoutingMode = (mode: ReadRoutingMode) => {
  setMode(mode);
  try {
    localStorage.setItem(READ_ROUTING_STORAGE_KEY, saveReadRoutingMode(mode));
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};
