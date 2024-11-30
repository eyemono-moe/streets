import { kinds } from "nostr-tools";
import { type Component, Show } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import { useProfile } from "../../../../shared/libs/query";
import type { ColumnContent } from "../../libs/deckSchema";
import { useColumnScrollButton } from "../../libs/useColumnScrollButton";
import ColumnHeader from "../ColumnHeader";
import TempColumnHeader from "../TempColumnHeader";

const Reactions: Component<{
  state: ColumnContent<"reactions">;
  isTempColumn?: boolean;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
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
        fallback={
          <ColumnHeader
            title={t("column.reactions.title")}
            subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
          />
        }
      >
        <TempColumnHeader
          title={t("column.reactions.title")}
          subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
        />
      </Show>
      <div class="h-full overflow-y-auto" ref={setTarget}>
        <ScrollButton />
        <InfiniteEvents
          filter={{
            kinds: [kinds.Reaction],
            authors: [props.state.pubkey],
          }}
        />
      </div>
    </div>
  );
};

export default Reactions;
