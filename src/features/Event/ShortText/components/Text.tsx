import { type Component, For, Show, createMemo } from "solid-js";
import EventBase from "../../../../shared/components/EventBase";
import RichContent from "../../../../shared/components/RichContents";
import { parseTextContent } from "../../../../shared/libs/parseTextContent";
import type { ParsedEventPacket } from "../../../../shared/libs/parser";
import type { ShortTextNote } from "../../../../shared/libs/parser/1_shortTextNote";
import type { EventTag } from "../../../../shared/libs/parser/commonTag";
import EmbedUser from "../../../User/components/EmbedUser";
import Reply from "./Reply";

const Text: Component<{
  event: ParsedEventPacket<ShortTextNote>;
  relay?: string[];
  small?: boolean;
  showEmbeddings?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  showReply?: boolean;
  hasChild?: boolean;
}> = (props) => {
  const replyTarget = createMemo(
    () => props.event.parsed.tags.filter((tag) => tag.kind === "p") ?? [],
  );

  const replyOrRoot = createMemo(() => {
    const reply = props.event.parsed.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "reply",
    );
    const root = props.event.parsed.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "root",
    );
    return reply ?? root;
  });

  const parsedContents = createMemo(() =>
    parseTextContent(props.event.parsed.content, props.event.parsed.tags),
  );

  return (
    <Show when={props.event} keyed>
      {(textEvent) => (
        <>
          <Show when={replyOrRoot()} keyed>
            {(replyTarget) => (
              <Show
                when={props.showReply}
                fallback={
                  <div class="b-l-2 b-dashed ml-[calc(0.75rem-1px)] py-1 pl-2 text-zinc-5">
                    load more
                  </div>
                }
              >
                <>
                  <Reply id={replyTarget.id} />
                  <div class="b-l-2 ml-[calc(0.75rem-1px)] h-4" />
                </>
              </Show>
            )}
          </Show>
          <EventBase
            eventPacket={textEvent}
            small={props.small}
            showReactions={props.showReactions}
            showActions={props.showActions}
            hasParent={replyOrRoot() !== undefined}
            hasChild={props.hasChild}
          >
            <div>
              <div class="text-3">
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
      )}
    </Show>
  );
};

export default Text;
