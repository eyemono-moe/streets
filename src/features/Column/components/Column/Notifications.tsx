import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useMe } from "../../../../context/me";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";
import NeedLoginPlaceholder from "../NeedLoginPlaceholder";

const Notifications: Component<{
  state: ColumnContent<"notifications">;
}> = () => {
  const t = useI18n();

  const [{ myPubkey: pubkey }] = useMe();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader title={t("column.notifications.title")} />
      <div class="h-full overflow-y-auto">
        <Show
          when={pubkey()}
          fallback={
            <NeedLoginPlaceholder
              message={t("column.notifications.needLogin")}
            />
          }
        >
          {(nonNullPubkey) => (
            <InfiniteEvents
              filter={{
                kinds: [kinds.ShortTextNote, kinds.Repost, kinds.Reaction],
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
