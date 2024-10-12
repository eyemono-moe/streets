import { type Component, For, Show, createMemo } from "solid-js";
import EventBase from "../../../shared/components/EventBase";
import RichContent from "../../../shared/components/RichContents";
import { parseTextContent } from "../../../shared/libs/parseTextContent";
import type { EventTag, Tag } from "../../../shared/libs/parser/commonTag";
import { useMyPubkey } from "../../../shared/libs/useMyPubkey";
import Reply from "../../Event/ShortText/components/Reply";
import EmbedUser from "../../User/components/EmbedUser";

const PostPreview: Component<{ content: string; tags: Tag[] }> = (props) => {
  const myPubkey = useMyPubkey();

  const replyTarget = createMemo(
    () => props.tags.filter((tag) => tag.kind === "p") ?? [],
  );

  const replyOrRoot = createMemo(() => {
    const reply = props.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "reply",
    );
    const root = props.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "root",
    );
    return reply ?? root;
  });

  const parsedContents = createMemo(() =>
    parseTextContent(props.content, props.tags, true),
  );

  return (
    <>
      <Show when={replyOrRoot()} keyed>
        {(replyTarget) => (
          <>
            <Reply id={replyTarget.id} />
            <div class="b-l-2 ml-[calc(0.75rem-1px)] h-4" />
          </>
        )}
      </Show>
      <EventBase
        eventPacket={{
          from: "",
          raw: {
            id: "",
            pubkey: myPubkey() ?? "",
            content: props.content,
            tags: [],
            kind: 1,
            created_at: Math.floor(new Date().getTime() / 1000),
            sig: "",
          },
          parsed: {
            kind: 1,
            content: props.content,
            id: "",
            pubkey: myPubkey() ?? "",
            // @ts-ignore (2322): Type 'Tag[]' is not assignable to type TextNoteTags.
            tags: props.tags,
          },
        }}
        hasParent={replyOrRoot() !== undefined}
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
            showLinkEmbeds
            showQuoteEmbeds
          />
        </div>
      </EventBase>
    </>
  );
};

export default PostPreview;
