import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useProfile } from "../../../../shared/libs/query";
import Profile from "../../../User/components/Profile";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";

const User: Component<{
  state: ColumnContent<"user">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
  const t = useI18n();

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <ColumnHeader
        title={t("column.profile.title")}
        subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
      />
      <Show when={props.state.pubkey} keyed>
        {(nonNullPubkey) => (
          <div class="h-full divide-y overflow-y-auto">
            <div class="max-h-140">
              <Profile pubkey={nonNullPubkey} />
            </div>
            <div class="h-full shrink-0">
              <InfiniteEvents
                filter={{
                  kinds: [kinds.ShortTextNote, kinds.Repost],
                  authors: [nonNullPubkey],
                }}
              />
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default User;
