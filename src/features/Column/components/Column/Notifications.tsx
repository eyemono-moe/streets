import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useMe } from "../../../../context/me";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useScrollToTop } from "../../../../shared/libs/useScrollToTop";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";
import NeedLoginPlaceholder from "../NeedLoginPlaceholder";
import TempColumnHeader from "../TempColumnHeader";

const Notifications: Component<{
  state: ColumnContent<"notifications">;
  isTempColumn?: boolean;
}> = (props) => {
  const t = useI18n();

  const [{ myPubkey: pubkey }] = useMe();

  const { setTarget, isTop, scrollToTop } = useScrollToTop();

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Show
        when={props.isTempColumn}
        fallback={
          <ColumnHeader
            title={t("column.notifications.title")}
            onClickScrollToTop={scrollToTop}
            showScrollToTop={!isTop()}
          />
        }
      >
        <TempColumnHeader
          title={t("column.notifications.title")}
          onClickScrollToTop={scrollToTop}
          showScrollToTop={!isTop()}
        />
      </Show>
      <div class="h-full overflow-y-auto" ref={setTarget}>
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
