import { type Component, For } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useFollowers, useProfile } from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Followers: Component<{
  state: PickColumnState<"followers">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
  const followers = useFollowers(() => props.state.pubkey);
  const t = useI18n();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        title={t("column.followers.title")}
        subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
      />
      <div class="h-full w-full divide-y overflow-y-auto">
        <For each={followers().data}>
          {(followerPubkey) => <ProfileRow pubkey={followerPubkey} />}
        </For>
      </div>
    </div>
  );
};

export default Followers;
