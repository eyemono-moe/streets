import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import { dateHuman, dateTimeHuman } from "../../../libs/format";
import { parseTextContent } from "../../../libs/parseTextContent";
import type { EventTag, Tag } from "../../../libs/parser/commonTag";
import { useProfile } from "../../../libs/rxQuery";
import { useMyPubkey } from "../../../libs/useMyPubkey";
import EmbedUser from "./EmbedUser";
import ShortTextContent from "./ShortTextContent";

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
          <span class="sticky top-2 cursor-pointer appearance-none bg-transparent">
            <Image
              class="inline-flex aspect-square h-auto w-10 select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
              fallbackDelay={500}
            >
              <Image.Img
                src={profile().data?.parsed.picture}
                alt={profile().data?.parsed.name}
                loading="lazy"
                class="h-full w-full object-cover"
              />
              <Image.Fallback class="flex h-full w-full items-center justify-center">
                {profile().data?.parsed.name?.slice(0, 2) ??
                  myPubkey()?.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </span>
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
                {/* TODO: ユーザーページへのリンクにする */}
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
            <ShortTextContent
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
