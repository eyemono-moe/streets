import { type Component, For, Show, createMemo } from "solid-js";
import EventBase from "../../../../shared/components/EventBase";
import RichContent from "../../../../shared/components/RichContents";
import { parseTextContent } from "../../../../shared/libs/parseTextContent";
import type { ParsedEventPacket } from "../../../../shared/libs/parser";
import type { ShortTextNote } from "../../../../shared/libs/parser/1_shortTextNote";
import { useColumn } from "../../../Column/context/column";
import EmbedUser from "../../../User/components/EmbedUser";
import ReplyTargets from "./ReplyTargets";

const Text: Component<{
  event: ParsedEventPacket<ShortTextNote>;
  relay?: string[];
  small?: boolean;
  showEmbeddings?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  collapseReplies?: boolean;
  showReplies?: boolean;
  hasChild?: boolean;
  replyDepth?: number;
  defaultExpanded?: boolean;
}> = (props) => {
  const replyTarget = createMemo(
    () => props.event.parsed.tags.filter((tag) => tag.kind === "p") ?? [],
  );

  const parsedContents = createMemo(() =>
    parseTextContent(props.event.parsed.content, props.event.parsed.tags),
  );

  const openTemp = useColumn()?.[1].openTempColumn;
  const handleOnSelect = () => {
    openTemp?.({
      type: "thread",
      targetEventID: props.event.parsed.id,
    });
  };

  return (
    <>
      <Show when={props.showReplies && props.event.parsed.replyOrRoot} keyed>
        {(replyTarget) => (
          <ReplyTargets
            id={replyTarget.id}
            defaultCollapsed={props.collapseReplies}
            replyDepth={props.replyDepth ?? 0}
          />
        )}
      </Show>
      <EventBase
        eventPacket={props.event}
        small={props.small}
        showReactions={props.showReactions}
        showActions={props.showActions}
        hasParent={props.event.parsed.replyOrRoot !== undefined}
        hasChild={props.hasChild}
        onSelected={handleOnSelect}
        defaultExpanded={props.defaultExpanded}
      >
        <div>
          <div class="text-caption">
            <For each={replyTarget()}>
              {(target, i) => (
                <>
                  <Show when={i() !== 0}>
                    <span>, </span>
                  </Show>
                  <EmbedUser pubkey={target.pubkey} relay={target.relay} />
                </>
              )}
            </For>
          </div>
          <RichContent
            contents={parsedContents()}
            showLinkEmbeds={props.showEmbeddings}
            showQuoteEmbeds={props.showEmbeddings}
          />
        </div>
      </EventBase>
    </>
  );
};

export default Text;
