import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

/**
 * その投稿への返信・リポスト・リアクションを取りにいき、store に変化があるたびに値が変わる。
 * 数え方は読む側が store から引き直す。
 */
export const useEngagementChanges = (
  id: Accessor<string>,
): Accessor<number> => {
  const { lookups } = useReadLayer();
  const [version, setVersion] = createSignal(0);

  createEffect(() => {
    onCleanup(
      lookups.watchEngagements(id(), () =>
        setVersion((current) => current + 1),
      ),
    );
  });

  return version;
};
