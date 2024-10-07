import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useMyPubkey } from "../../../../libs/useMyPubkey";
import InfiniteNotifications from "../../../ShortText/components/InfiniteNotifications";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Notifications: Component<{
  state: PickColumnState<"notifications">;
}> = () => {
  const myPubkey = useMyPubkey();
  const t = useI18n();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader title={t("column.notifications.title")} />
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
