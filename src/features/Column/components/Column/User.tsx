import type { Component } from "solid-js";
import Profile from "../../../Profile/components/Profile";
import InfinitePosts from "../../../ShortText/components/InfinitePosts";
import type { PickColumnState } from "../../context/deck";

const User: Component<{
  state: PickColumnState<"user">;
}> = (props) => {
  return (
    <div class="flex h-full flex-col divide-y">
      <div class="max-h-100">
        <Profile pubkey={props.state.pubkey} />
      </div>
      <div class="h-full shrink-0">
        <InfinitePosts
          filter={{
            authors: [props.state.pubkey],
          }}
        />
      </div>
    </div>
  );
};

export default User;
