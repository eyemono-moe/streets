/**
 * 右端まで送ったとき、標準幅のカラムを中央付近に置き、トーストの場所を空ける。
 * カラムは CSS の order で並べているので、order で最後に置く。
 *
 * 幅は見えている帯の幅（`DeckStrip` の container）から決める。`%` にすると、親が
 * カラムを並べた中身の幅（`w-max`）なので、カラムが増えるほど余白も伸びる。
 */
const DeckEndSpace = () => (
  <div
    aria-hidden="true"
    class="order-last w-[max(21rem,calc(50cqw-11.875rem))] shrink-0"
  />
);

export default DeckEndSpace;
