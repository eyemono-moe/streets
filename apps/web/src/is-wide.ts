import { createSignal, onCleanup } from "solid-js";

/** カラムを横に並べられる幅かどうか。狭い端末では 1 列ずつ見せる。 */
export const useIsWide = () => {
  const query = matchMedia("(min-width: 768px)");
  const [wide, setWide] = createSignal(query.matches);
  const sync = () => setWide(query.matches);
  query.addEventListener("change", sync);
  onCleanup(() => query.removeEventListener("change", sync));
  return wide;
};
