import { type Component, For, Show, createMemo } from "solid-js";
import RichContent from "../../../shared/components/RichContents";
import { dateHuman, dateTimeHuman } from "../../../shared/libs/format";
import { parseTextContent } from "../../../shared/libs/parseTextContent";
import type { EventTag, Tag } from "../../../shared/libs/parser/commonTag";
import { useProfile } from "../../../shared/libs/query";
import { useMyPubkey } from "../../../shared/libs/useMyPubkey";
import Reply from "../../Event/ShortText/components/Reply";
import Avatar from "../../User/components/Avatar";
import EmbedUser from "../../User/components/EmbedUser";

const PostPreview: Component<{ content: string; tags: Tag[] }> = (props) => {
  const myPubkey = useMyPubkey();
  const profile = useProfile(myPubkey);

  const replyTarget = createMemo(
    () => props.tags.filter((tag) => tag.kind === "p") ?? [],
  );

  // TODO: 別ファイルに切り出す?
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

  const textType = () => {
    // e tagがあればreply
    if (replyOrRoot()) return "reply";
    // p tagのみがあればmention
    if (replyTarget().length > 0) return "mention";
    return "normal";
  };

  return (
    <div class="text-4">
      <Show when={textType() === "reply"}>
        {/* biome-ignore lint/style/noNonNullAssertion: textType() === "reply" */}
        <Reply id={replyOrRoot()!.id} />
        <div class="b-l-2 ml-[calc(0.75rem-1px)] h-4" />
      </Show>
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
        style={{
          "grid-template-areas": `
      "avatar name"
      "avatar content"
      `,
        }}
      >
        <div class="grid-area-[avatar] grid grid-rows-[auto_minmax(0,1fr)]">
          <div class="sticky top-2 w-10">
            <Avatar pubkey={myPubkey()} />
          </div>
        </div>
        <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
          <span class="w-fit max-w-full cursor-pointer appearance-none truncate bg-transparent hover:underline">
            <Show when={profile().data} fallback={myPubkey()}>
              <span>{profile().data?.parsed.display_name}</span>
              <span class="text-3.5 text-zinc-5">
                @{profile().data?.parsed.name}
              </span>
            </Show>
          </span>
          <span class="text-3.5 text-zinc-5" title={dateHuman(new Date())}>
            {dateTimeHuman(new Date())}
          </span>
        </div>
        <div class="grid-area-[content] flex flex-col gap-2">
          <Show when={textType() === "mention" || textType() === "reply"}>
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
          </Show>
          <div>
            <RichContent
              contents={parsedContents()}
              showLinkEmbeds
              showQuoteEmbeds
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostPreview;
