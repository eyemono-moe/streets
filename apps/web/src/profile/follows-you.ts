import { followsPubkey } from "@streets/core/nostr/follow-list";
import { createSection } from "@streets/core/solid/create-section";
import type { Accessor } from "solid-js";
import { useEventActions } from "../actions";
import { useReadLayer } from "../read-layer";

const FOLLOW_KIND = 3;

/**
 * その人が自分をフォローしているか。自分自身・ログインしていない・まだ分からない
 * ときは false（何も出さない）。
 *
 * 相手の kind:3 のうち、自分を指しているものだけを聞く。kind:3 は置換可能なので、
 * リレーは最新の 1 件しか持たない —— 返ってこなければ、最新の版では自分を
 * フォローしていない（古い版が残って「されている」と出ることはない）。
 * 全部を引くと数千人分のタグが届くので、フォローされていない人の分は運ばない。
 */
export const useFollowsYou = (pubkey: Accessor<string>): Accessor<boolean> => {
  const actions = useEventActions();
  const { manager, store } = useReadLayer();
  const viewer = actions?.viewer;
  if (viewer === undefined) return () => false;

  // Storybook など読み取り層が無いときは、手元にある分だけで答える。
  if (manager === undefined) {
    return () =>
      pubkey() !== viewer &&
      followsPubkey(store.latestReplaceable(FOLLOW_KIND, pubkey()), viewer) ===
        true;
  }

  const section = createSection({
    manager,
    source: () => ({
      type: "nostr",
      filters:
        pubkey() === viewer
          ? []
          : [
              {
                kinds: [FOLLOW_KIND],
                authors: [pubkey()],
                "#p": [viewer],
                limit: 1,
              },
            ],
    }),
  });
  return () =>
    pubkey() !== viewer && followsPubkey(section.items()[0], viewer) === true;
};
