import { type Component, type JSX, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import type { Reaction as TReaction } from "../../../../shared/libs/parser/7_reaction";
import { useEventByID } from "../../../../shared/libs/query";
import { useColumn } from "../../../Column/context/column";
import ReactionUserName from "./ReactionUserName";

const Reaction: Component<{
  reaction: TReaction;
}> = (props) => {
  const event = useEventByID(() => props.reaction.targetEvent.id);

  const openTemp = useColumn()?.[1].openTempColumn;
  const handleOnSelect: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (
    e,
  ) => {
    // ネストしたbuttonがクリックされた場合は何もしない
    if (e.target.closest("button") !== e.currentTarget) return;

    // リンク, 画像, 動画, 埋め込み, ハッシュタグ, リレーリンクがクリックされた場合は何もしない
    // see: project://src/shared/components/RichContents.tsx
    if (
      e.target.closest(
        "a, img, video, [data-embed], [data-hashtag], [data-relay]",
      )
    )
      return;

    openTemp?.({
      type: "thread",
      targetEventID: props.reaction.targetEvent.id,
    });
  };

  return (
    <button
      class="group/event w-full appearance-none space-y-1 bg-transparent p-2 text-align-unset"
      type="button"
      onClick={handleOnSelect}
    >
      <ReactionUserName reaction={props.reaction} />
      {/* TODO: fallback */}
      <Show when={event().data} keyed>
        {(e) => <Event event={e} showReactions showActions />}
      </Show>
    </button>
  );
};

export default Reaction;
