type Point = { x: number; y: number };

/** 指がこれだけ動くまでは、どちらへ払うのか決めない（タップの揺れで決めない）。 */
export const SWIPE_SLOP = 10;

/** 離したときに、これより速く動いていれば、位置によらず動いていた向きに決める（px/ms）。 */
const FLING_VELOCITY = 0.4;

/**
 * 払い始めた指が、メニューを動かす払い方か。`toward` は動かす向き（開くなら右、閉じるなら左）。
 * まだ決められなければ `pending`、ほかの操作（縦のスクロールなど）なら `other`。
 *
 * 向きだけでなく角度も見る。縦にスクロールした指が少し横へ流れただけで開くと、
 * 一覧を読んでいる途中で何度もメニューが出てしまう。
 */
export const menuSwipeIntent = (
  start: Point,
  current: Point,
  toward: "left" | "right",
): "pending" | "menu" | "other" => {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (Math.hypot(dx, dy) < SWIPE_SLOP) return "pending";
  const forward = toward === "right" ? dx > 0 : dx < 0;
  return forward && Math.abs(dx) > Math.abs(dy) * 2 ? "menu" : "other";
};

/** メニューが出ている割合（0 で隠れ、1 で出きる）。`shown` は出ている幅。 */
export const menuProgress = (shown: number, width: number): number =>
  width <= 0 ? 0 : Math.min(1, Math.max(0, shown / width));

/**
 * 指を離したときに、メニューを開いたままにするか。速く払ったらその向きに、
 * ゆっくり離したら半分を越えているかで決める。`velocity` は開く向き（右）を正とする。
 */
export const settleMenu = (progress: number, velocity: number): boolean => {
  if (velocity > FLING_VELOCITY) return true;
  if (velocity < -FLING_VELOCITY) return false;
  return progress > 0.5;
};
