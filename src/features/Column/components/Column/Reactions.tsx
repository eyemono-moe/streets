import type { Component } from "solid-js";
import { useProfile } from "../../../../libs/rxQuery";
import InfiniteReactions from "../../../ShortText/components/InfiniteReactions";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Reactions: Component<{
  state: PickColumnState<"reactions">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        name={
          profile().data?.parsed.name
            ? `リアクション (@${profile().data?.parsed.name})`
            : "リアクション"
        }
      />
      <div class="h-full overflow-y-auto">
        <InfiniteReactions
          filter={{
            authors: [props.state.pubkey],
          }}
        />
      </div>
    </div>
  );
};

export default Reactions;
