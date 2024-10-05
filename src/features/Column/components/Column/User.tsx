import type { Component } from "solid-js";
import { useProfile } from "../../../../libs/rxQuery";
import Profile from "../../../Profile/components/Profile";
import InfinitePosts from "../../../ShortText/components/InfinitePosts";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const User: Component<{
  state: PickColumnState<"user">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        name={
          profile.data?.parsed.name
            ? `ユーザー (@${profile.data?.parsed.name})`
            : "ユーザー"
        }
      />
      <div class="h-full divide-y overflow-y-auto">
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
    </div>
  );
};

export default User;
