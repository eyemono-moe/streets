import { type MuteChange, type MuteEntry, applyMuteChanges } from "./mute-list";

/**
 * ミュートの書きかけ。`pending` はまだ送っていない変更、`saving` は送っている
 * 途中の変更。画面には読み取った一覧へ両方を当てたものを出す。
 */
export type MuteEditState = {
  pending: MuteChange[];
  saving: MuteChange[];
};

export type MuteEditEvent =
  | { type: "mutes/change"; change: MuteChange }
  /** 待ちが明けた。書きかけを送る。 */
  | { type: "mutes/flush" }
  | { type: "mutes/saved" }
  | { type: "mutes/failed" };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyMuteEdit = (): MuteEditState => ({ pending: [], saving: [] });

export const muteEditTransition = (
  state: MuteEditState,
  event: MuteEditEvent,
): MuteEditState => {
  switch (event.type) {
    case "mutes/change":
      return { ...state, pending: [...state.pending, event.change] };
    case "mutes/flush":
      // 送っている途中に重ねて送ると、同じ最新から作った 2 つの版が競う。
      if (state.saving.length > 0 || state.pending.length === 0) return state;
      // 配列は作り直して渡す（store の reconcile が元の配列を書き換えるため）。
      return { pending: [], saving: [...state.pending] };
    case "mutes/saved":
    case "mutes/failed":
      // 送れなかった変更は捨てる（画面は読み取った一覧に戻る）。失敗はトーストで知らせる。
      return state.saving.length === 0 ? state : { ...state, saving: [] };
  }
};

export const displayedMutes = (
  saved: readonly MuteEntry[],
  state: MuteEditState,
): MuteEntry[] => applyMuteChanges(saved, [...state.saving, ...state.pending]);
