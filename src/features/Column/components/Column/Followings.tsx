import { type Component, Show } from "solid-js";
import { useFollowees } from "../../../../libs/rxQuery";
import { useMyPubkey } from "../../../../libs/useMyPubkey";
import InfinitePosts from "../../../ShortText/components/InfinitePosts";
import type { PickColumnState } from "../../context/deck";

const Followings: Component<{
  state: PickColumnState<"follow">;
}> = () => {
  const myPubkey = useMyPubkey();
  const followees = useFollowees(myPubkey);

  return (
    <Show when={followees.data}>
      <InfinitePosts
        filter={{
          authors: followees.data?.parsed.followees.map((f) => f.pubkey),
        }}
      />
    </Show>
  );
};

export default Followings;
