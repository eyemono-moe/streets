import { type Component, Show } from "solid-js";
import { useMyPubkey } from "../../../../libs/useMyPubkey";
import InfinitePosts from "../../../ShortText/components/InfinitePosts";
import { useQueryFollowList } from "../../../ShortText/query";
import type { PickColumnState } from "../../context/deck";

const Followings: Component<{
  state: PickColumnState<"follow">;
}> = () => {
  const myPubkey = useMyPubkey();
  const followees = useQueryFollowList(myPubkey);

  return (
    <Show when={followees()}>
      <InfinitePosts
        filter={{
          authors: followees(),
        }}
      />
    </Show>
  );
};

export default Followings;
