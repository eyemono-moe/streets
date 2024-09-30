import type { Filter } from "nostr-tools";
import type { Component } from "solid-js";
import { useQueryPubkey } from "../../../../libs/useNIP07";
import Texts from "../../../ShortText/components/Texts";
import { useQueryFollowList } from "../../../ShortText/query";
import type { PickColumnState } from "../../context/deck";

const Followings: Component<{
  state: PickColumnState<"follow">;
}> = () => {
  const pubkey = useQueryPubkey();
  const follows = useQueryFollowList(() => pubkey.data);
  const filter = (): Omit<Filter, "kinds" | "since"> | undefined =>
    follows.data
      ? {
          authors: follows.data.tags.map((tag) => tag.pubkey),
        }
      : undefined;

  return <Texts filter={filter()} />;
};

export default Followings;
