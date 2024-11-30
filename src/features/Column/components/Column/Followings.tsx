import { kinds } from "nostr-tools";
import { type Component, Match, Show, Switch } from "solid-js";
import { useMe } from "../../../../context/me";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useFollowees } from "../../../../shared/libs/query";
import type { ColumnContent } from "../../libs/deckSchema";
import { useColumnScrollButton } from "../../libs/useColumnScrollButton";
import ColumnHeader from "../ColumnHeader";
import NeedLoginPlaceholder from "../NeedLoginPlaceholder";
import TempColumnHeader from "../TempColumnHeader";

const Followings: Component<{
  state: ColumnContent<"timeline">;
  isTempColumn?: boolean;
}> = (props) => {
  const [{ myPubkey: pubkey }] = useMe();
  const followees = useFollowees(() => pubkey());
  const t = useI18n();

  const { ScrollButton, setTarget } = useColumnScrollButton();

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
        fallback={<ColumnHeader title={t("column.timeline.title")} />}
      >
        <TempColumnHeader title={t("column.timeline.title")} />
      </Show>
      <div class="h-full overflow-y-auto" ref={setTarget}>
        <ScrollButton />
        <Switch>
          <Match when={pubkey() === undefined}>
            <NeedLoginPlaceholder message={t("column.timeline.needLogin")} />
          </Match>
          <Match when={followees().data}>
            <InfiniteEvents
              filter={{
                kinds: [kinds.ShortTextNote, kinds.Repost],
                authors: followees().data?.parsed.followees.map(
                  (f) => f.pubkey,
                ),
              }}
            />
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export default Followings;
