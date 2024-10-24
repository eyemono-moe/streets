import { type Component, type JSX, Show } from "solid-js";
import Event from "../../../../shared/components/Event";
import type { Repost as TRepost } from "../../../../shared/libs/parser/6_repost";
import { useEventByID } from "../../../../shared/libs/query";
import { useColumn } from "../../../Column/context/column";
import RepostUserName from "./RepostUserName";

const Repost: Component<{
  repost: TRepost;
}> = (props) => {
  const event = useEventByID(() => props.repost.targetEventID);

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
      targetEventID: props.repost.targetEventID,
    });
  };

  return (
    <button
      class="group/event w-full appearance-none space-y-1 bg-transparent p-2 text-align-unset"
      type="button"
      onClick={handleOnSelect}
    >
      <RepostUserName pubkey={props.repost.pubkey} />
      {/* TODO: fallback */}
      <Show when={event().data} keyed>
        {(e) => <Event event={e} showReactions showActions />}
      </Show>
    </button>
  );
};

export default Repost;
