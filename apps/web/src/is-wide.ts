import { createSignal, onCleanup } from "solid-js";

/** カラムを横に並べられる幅。狭い端末では 1 列ずつ見せる。 */
export const WIDE_QUERY = "(min-width: 768px)";

/** カラムを横に並べられる幅かどうか。 */
export const useIsWide = () => {
  const query = matchMedia(WIDE_QUERY);
  const [wide, setWide] = createSignal(query.matches);
  const sync = () => setWide(query.matches);
  query.addEventListener("change", sync);
  onCleanup(() => query.removeEventListener("change", sync));
  return wide;
};
