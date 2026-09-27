/** 右端まで送ったとき、標準幅のカラムを中央付近に置き、トーストの場所を空ける。 */
const DeckEndSpace = () => (
  <div aria-hidden="true" class="w-[max(21rem,calc(50%-11.875rem))] shrink-0" />
);

export default DeckEndSpace;
