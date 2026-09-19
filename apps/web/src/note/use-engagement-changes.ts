import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useReadLayer } from "../read-layer";

/**
 * その投稿への返信・リポスト・リアクションを取りにいき、store に変化があるたびに値が変わる。
 * 数え方は読む側が store から引き直す。
 */
export const useEngagementChanges = (
  id: Accessor<string>,
): Accessor<number> => {
  const { store, engagements } = useReadLayer();
  const [version, setVersion] = createSignal(0);
  const bump = () => setVersion((current) => current + 1);

  createEffect(() => {
    const target = id();
    engagements.request(target);
    onCleanup(engagements.subscribe(bump));
    onCleanup(
      store.subscribe((change) => {
        if (
          change.event.tags.some((tag) => tag[0] === "e" && tag[1] === target)
        ) {
          bump();
        }
      }),
    );
  });

  return version;
};
