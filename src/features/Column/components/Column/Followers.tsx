import { type Component, For, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useFollowers, useProfile } from "../../../../shared/libs/query";
import ProfileRow from "../../../User/components/ProfileRow";
import type { ColumnContent } from "../../libs/deckSchema";
import { useOpenUserColumn } from "../../libs/useOpenColumn";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const Followers: Component<{
  state: ColumnContent<"followers">;
  isTempColumn?: boolean;
}> = (props) => {
  const t = useI18n();

  const profile = useProfile(() => props.state.pubkey);
  const followers = useFollowers(() => props.state.pubkey);
  const openUserColumn = useOpenUserColumn();

  return (
    <div
      class="grid h-full w-full divide-y"
      classList={{
        "grid-rows-[1fr]": props.isTempColumn,
        "grid-rows-[auto_minmax(0,1fr)]": !props.isTempColumn,
      }}
    >
      <Show
        when={props.isTempColumn}
        fallback={
          <ColumnHeader
            title={t("column.followers.title")}
            subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
          />
        }
      >
        <TempColumnHeader
          title={t("column.followers.title")}
          subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
        />
      </Show>
      <div class="b-b-1 h-full w-full overflow-y-auto">
        <For each={followers().data}>
          {(followerPubkey) => (
            <ProfileRow
              pubkey={followerPubkey}
              showFollowButton
              onClick={() => openUserColumn(followerPubkey)}
            />
          )}
        </For>
        <div class="h-50%" />
      </div>
    </div>
  );
};

export default Followers;
