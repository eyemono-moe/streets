import { createSignal } from "solid-js";

// 発言の数だけ読むので、部品ごとに見張らず 1 度だけ見張る。
const query = matchMedia("(hover: hover)");
const [canHover, setCanHover] = createSignal(query.matches);
query.addEventListener("change", () => setCanHover(query.matches));

/** 主に使う入力でカーソルを当てられるか。触る端末では、ホバーで出す操作が出ない。 */
export { canHover };
