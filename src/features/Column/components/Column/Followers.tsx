import { type Component, For } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useFollowers, useProfile } from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { PickColumnState } from "../../libs/deckSchema";
import { useOpenUserColumn } from "../../libs/useOpenColumn";
import ColumnHeader from "../ColumnHeader";

const Followers: Component<{
  state: PickColumnState<"followers">;
}> = (props) => {
  const t = useI18n();

  const profile = useProfile(() => props.state.pubkey);
  const followers = useFollowers(() => props.state.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        title={t("column.followers.title")}
        subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
      />
      <div class="h-full w-full divide-y overflow-y-auto">
        <For each={followers().data}>
          {(followerPubkey) => (
            <ProfileRow
              pubkey={followerPubkey}
              showFollowButton
              onClick={() => openUserColumn(followerPubkey)}
            />
          )}
        </For>
      </div>
    </div>
  );
};

export default Followers;
