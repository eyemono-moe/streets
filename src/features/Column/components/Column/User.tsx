import { kinds } from "nostr-tools";
import type { Component } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useProfile } from "../../../../shared/libs/query";
import Profile from "../../../User/components/Profile";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const User: Component<{
  state: PickColumnState<"user">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
  const t = useI18n();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        title={t("column.profile.title")}
        subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
      />
      <div class="h-full divide-y overflow-y-auto">
        <div class="max-h-140">
          <Profile pubkey={props.state.pubkey} />
        </div>
        <div class="h-full shrink-0">
          <InfiniteEvents
            filter={{
              kinds: [kinds.ShortTextNote, kinds.Repost],
              authors: [props.state.pubkey],
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default User;
