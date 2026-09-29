import { createSignal, onCleanup } from "solid-js";

/**
 * ダイアログのページ一覧を横に置ける幅（一覧 220px と本文）。カラムを横に並べるかは
 * これとは別に、`deck-layout-setting` の設定と幅で決める。
 */
const WIDE_QUERY = "(min-width: 768px)";

/** ダイアログや最初の画面を、横に広げて組める幅かどうか。 */
export const useIsWide = () => {
  const query = matchMedia(WIDE_QUERY);
  const [wide, setWide] = createSignal(query.matches);
  const sync = () => setWide(query.matches);
  query.addEventListener("change", sync);
  onCleanup(() => query.removeEventListener("change", sync));
  return wide;
};
