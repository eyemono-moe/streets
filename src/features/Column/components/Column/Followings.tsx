import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useFollowees } from "../../../../shared/libs/query";
import { useMyPubkey } from "../../../../shared/libs/useMyPubkey";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Followings: Component<{
  state: PickColumnState<"timeline">;
}> = () => {
  const myPubkey = useMyPubkey();
  const followees = useFollowees(myPubkey);
  const t = useI18n();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader title={t("column.timeline.title")} />
      <div class="h-full overflow-y-auto">
        <Show when={followees().data}>
          <InfiniteEvents
            filter={{
              kinds: [kinds.ShortTextNote, kinds.Repost],
              authors: followees().data?.parsed.followees.map((f) => f.pubkey),
            }}
          />
        </Show>
      </div>
    </div>
  );
};

export default Followings;
