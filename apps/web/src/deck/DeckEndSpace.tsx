/**
 * 右端まで送ったとき、標準幅のカラムを中央付近に置き、トーストの場所を空ける。
 * カラムは CSS の order で並べているので、order で最後に置く。
 */
const DeckEndSpace = () => (
  <div
    aria-hidden="true"
    class="order-last w-[max(21rem,calc(50%-11.875rem))] shrink-0"
  />
);

export default DeckEndSpace;
