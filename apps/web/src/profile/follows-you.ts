import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { useEventActions } from "../actions";
import { useReadLayer } from "../read-layer";

/**
 * その人が自分をフォローしているか。自分自身・ログインしていない・まだ分からない
 * ときは false（何も出さない）。
 *
 * 手元にその人のフォロー一覧があればそれで答える。無いときだけ、相手の kind:3 のうち
 * 自分を指しているものを一度だけ聞く。kind:3 は置換可能なので、リレーは最新の 1 件しか
 * 持たない —— 返ってこなければ、最新の版では自分をフォローしていない。
 * 全部を引くと数千人分のタグが届くので、フォローされていない人の分は運ばない。
 * 取り直しの間隔と同じ人の取得のまとめは読み取り層（`watchFollowsYou`）が持つ。
 */
export const useFollowsYou = (pubkey: Accessor<string>): Accessor<boolean> => {
  const actions = useEventActions();
  const { lookups } = useReadLayer();
  const viewer = actions?.viewer;
  if (viewer === undefined) return () => false;

  const [follows, setFollows] = createSignal(false);
  createEffect(() => {
    setFollows(false);
    onCleanup(lookups.watchFollowsYou(pubkey(), viewer, setFollows));
  });
  return follows;
};
