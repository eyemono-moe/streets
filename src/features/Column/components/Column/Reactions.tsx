import type { Component } from "solid-js";
import { useI18n } from "../../../../i18n";
import { useProfile } from "../../../../libs/rxQuery";
import InfiniteReactions from "../../../ShortText/components/InfiniteReactions";
import type { PickColumnState } from "../../context/deck";
import ColumnHeader from "../ColumnHeader";

const Reactions: Component<{
  state: PickColumnState<"reactions">;
}> = (props) => {
  const profile = useProfile(() => props.state.pubkey);
  const t = useI18n();

  return (
    <div class="flex w-full flex-col divide-y">
      <ColumnHeader
        title={t("column.reactions.title")}
        subTitle={`@${profile().data?.parsed.name ?? props.state.pubkey}`}
      />
      <div class="h-full overflow-y-auto">
        <InfiniteReactions
          filter={{
            authors: [props.state.pubkey],
          }}
        />
      </div>
    </div>
  );
};

export default Reactions;
