import { kinds } from "nostr-tools";
import { type Component, type JSX, Match, Switch } from "solid-js";
import { useColumn } from "../../features/Column/context/column";
import Reaction from "../../features/Event/Reaction/components/Reaction";
import Repost from "../../features/Event/Repost/components/Repost";
import Text from "../../features/Event/ShortText/components/Text";
import { useI18n } from "../../i18n";
import type { ParsedEventPacket } from "../libs/parser";
import type { ShortTextNote } from "../libs/parser/1_shortTextNote";
import type { Repost as TRepost } from "../libs/parser/6_repost";
import type { Reaction as TReaction } from "../libs/parser/7_reaction";
import CopyablePre from "./CopyablePre";
import EventBase from "./EventBase";

const Event: Component<{
  event: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
}> = (props) => {
  const t = useI18n();
  const openTemp = useColumn()?.[1].openTempColumn;

  const handleOnClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (
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

    console.log("event clicked", props.event.parsed);
  };

  return (
    <button
      onClick={handleOnClick}
      type="button"
      class="group/event block w-full appearance-none bg-transparent p-2 text-align-unset enabled:focus-visible:bg-alpha-hover enabled:hover:bg-alpha-hover group-[_]/event:p-0 group-[_]/event:hover:bg-transparent!"
    >
      <Switch
        fallback={
          <EventBase
            eventPacket={props.event}
            small={props.small}
            showReactions={props.showReactions}
            showActions={props.showActions}
          >
            <div class="c-secondary flex items-center gap-0.5">
              <div class="i-material-symbols:error-circle-rounded aspect-square h-4 w-auto" />
              <span class="text-caption">{t("event.unknown")}</span>
            </div>
            <CopyablePre content={JSON.stringify(props.event.raw, null, 2)} />
          </EventBase>
        }
      >
        <Match
          when={
            props.event.parsed.kind === kinds.ShortTextNote &&
            (props.event as ParsedEventPacket<ShortTextNote>)
          }
          keyed
        >
          {(event) => (
            <Text
              event={event}
              small={props.small}
              showReactions={props.showReactions}
              showActions={props.showActions}
              showReply={!props.small}
              showEmbeddings={!props.small}
            />
          )}
        </Match>
        <Match
          when={
            props.event.parsed.kind === kinds.Repost &&
            (props.event as ParsedEventPacket<TRepost>)
          }
          keyed
        >
          {(event) => <Repost repost={event.parsed} />}
        </Match>
        <Match
          when={
            props.event.parsed.kind === kinds.Reaction &&
            (props.event as ParsedEventPacket<TReaction>)
          }
          keyed
        >
          {(event) => <Reaction reaction={event.parsed} />}
        </Match>
      </Switch>
    </button>
  );
};

export default Event;
