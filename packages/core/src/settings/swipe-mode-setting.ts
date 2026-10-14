/**
 * 1 列ずつ見せるときに、左右に払うと何が起きるか。端末ごとの設定 ——
 * 払う操作のくせは、持っている端末と持ち方で変わるから。
 *
 * - `loop`: カラムを移り、両端はつながる。払ってもメニューは出ない
 * - `stop`: カラムを移り、両端で止まる。いちばん左からさらに右へ払うとメニュー
 * - `off`: カラムは移らない。どこで右へ払ってもメニュー
 */
export type SwipeMode = "loop" | "stop" | "off";

export const SWIPE_MODE_STORAGE_KEY = "streets.v1.swipeMode";

/** 未保存・読めない値は、一周する（この設定ができる前と同じ動き）。 */
export const loadSwipeMode = (raw: string | null): SwipeMode =>
  raw === "stop" || raw === "off" ? raw : "loop";
