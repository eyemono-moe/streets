import { type Component, Show } from "solid-js";
import { useMyPubkey } from "../../../../libs/useMyPubkey";
import InfiniteNotifications from "../../../ShortText/components/InfiniteNotifications";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Notifications: Component<{
  state: PickColumnState<"notifications">;
}> = () => {
  const myPubkey = useMyPubkey();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader />
      <div class="h-full overflow-y-auto">
        <Show when={myPubkey()}>
          {(nonNullPubkey) => (
            <InfiniteNotifications
              filter={{
                "#p": [nonNullPubkey()],
              }}
            />
          )}
        </Show>
      </div>
    </div>
  );
};

export default Notifications;
