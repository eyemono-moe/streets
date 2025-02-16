import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useProfile } from "../../../../shared/libs/query";
import { useScrollToTop } from "../../../../shared/libs/useScrollToTop";
import Profile from "../../../User/components/Profile";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const User: Component<{
  state: ColumnContent<"user">;
  isTempColumn?: boolean;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
  const t = useI18n();

  const { setTarget, isTop, scrollToTop } = useScrollToTop();

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Show
        when={props.isTempColumn}
        fallback={
          <ColumnHeader
            title={t("column.profile.title")}
            subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
            onClickScrollToTop={scrollToTop}
            showScrollToTop={!isTop()}
          />
        }
      >
        <TempColumnHeader
          title={t("column.profile.title")}
          subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
          onClickScrollToTop={scrollToTop}
          showScrollToTop={!isTop()}
        />
      </Show>
      <Show when={props.state.pubkey} keyed>
        {(nonNullPubkey) => (
          <div class="h-full divide-y overflow-y-auto" ref={setTarget}>
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
