import type { Filter } from "nostr-tools";
import type { Component } from "solid-js";
import Profile from "../../../Profile/components/Profile";
import Texts from "../../../ShortText/components/Texts";
import type { PickColumnState } from "../../context/deck";

const User: Component<{
  state: PickColumnState<"user">;
}> = (props) => {
  const filter = (): Omit<Filter, "kinds" | "since"> => ({
    authors: [props.state.pubkey],
  });

  return (
    <div class="flex h-full flex-col divide-y">
      <Profile pubkey={props.state.pubkey} />
      <div class="h-full shrink-0">
        <Texts filter={filter()} />
      </div>
    </div>
  );
};

export default User;
