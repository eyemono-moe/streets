import type { NostrEvent } from "@streets/core/nostr/event";
import {
  CONTENT_WARNING_STORAGE_KEY,
  type ContentWarningMode,
  listsUnderWarning,
  loadContentWarningMode,
  saveContentWarningMode,
} from "@streets/core/settings/content-warning-setting";
import { createSignal } from "solid-js";
import { useEventActions } from "./actions";

const read = (): ContentWarningMode => {
  try {
    return loadContentWarningMode(
      localStorage.getItem(CONTENT_WARNING_STORAGE_KEY),
    );
  } catch {
    return "hide";
  }
};

const [contentWarningMode, setMode] = createSignal(read());

/** 閲覧注意の投稿の扱い（この端末の設定）。 */
export { contentWarningMode };

export const setContentWarningMode = (mode: ContentWarningMode) => {
  setMode(mode);
  try {
    localStorage.setItem(
      CONTENT_WARNING_STORAGE_KEY,
      saveContentWarningMode(mode),
    );
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};

/** 一覧に並べるかを見る関数。「一覧に出さない」のときだけ落とす。 */
export const useListsUnderWarning = (): ((event: NostrEvent) => boolean) => {
  const actions = useEventActions();
  return (event) =>
    listsUnderWarning(contentWarningMode(), event, actions?.viewer);
};
