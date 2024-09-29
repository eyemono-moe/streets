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
    <div class="divide-y">
      <Profile pubkey={props.state.pubkey} />
      <Texts filter={filter()} />
    </div>
  );
};

export default User;
