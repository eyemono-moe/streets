import {
  COMPOSE_DRAFTS_STORAGE_KEY,
  type ComposeDraft,
  loadComposeDrafts,
  putDraft,
  removeDraft,
  saveComposeDrafts,
} from "@streets/core/view/compose-drafts";
import { createSignal } from "solid-js";

const read = (): ComposeDraft[] => {
  try {
    return loadComposeDrafts(localStorage.getItem(COMPOSE_DRAFTS_STORAGE_KEY));
  } catch {
    return [];
  }
};

// 投稿パネルは開くたびに作り直されるので、下書きはパネルの外に置く。
const [composeDrafts, setDrafts] = createSignal(read());

export { composeDrafts };

const commit = (next: ComposeDraft[]) => {
  setDrafts(next);
  try {
    localStorage.setItem(COMPOSE_DRAFTS_STORAGE_KEY, saveComposeDrafts(next));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};

export const putComposeDraft = (draft: ComposeDraft) =>
  commit(putDraft(composeDrafts(), draft));

export const removeComposeDraft = (id: string) =>
  commit(removeDraft(composeDrafts(), id));
