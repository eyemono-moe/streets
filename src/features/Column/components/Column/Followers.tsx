import { type Component, For } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useFollowers, useProfile } from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { ColumnContent } from "../../libs/deckSchema";
import { useOpenUserColumn } from "../../libs/useOpenColumn";
import ColumnHeader from "../ColumnHeader";

const Followers: Component<{
  state: ColumnContent<"followers">;
}> = (props) => {
  const t = useI18n();

  const profile = useProfile(() => props.state.pubkey);
  const followers = useFollowers(() => props.state.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
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
