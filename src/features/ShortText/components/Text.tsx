import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { Popover } from "@kobalte/core/popover";
import { type Component, For, Show, createMemo } from "solid-js";
import EmojiPicker, { type Emoji } from "../../../components/EmojiPicker";
import { dateHuman, dateTimeHuman } from "../../../libs/format";
import { showLoginModal } from "../../../libs/nostrLogin";
import { parseTextContent } from "../../../libs/parseTextContent";
import type { EventTag } from "../../../libs/parser/commonTag";
import {
  useProfile,
  useRepostsOfEvent,
  useSendReaction,
  useShortTextByID,
} from "../../../libs/rxQuery";
import { isLogged } from "../../../libs/useMyPubkey";
import { useOpenUserColumn } from "../../Column/libs/useOpenColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import EmbedUser from "./EmbedUser";
import PlaceholderText from "./PlaceholderText";
import Reactions from "./Reactions";
import Reply from "./Reply";
import ShortTextContent from "./ShortTextContent";
const Text: Component<{
  id: string;
  showActions?: boolean;
  showReply?: boolean;
  small?: boolean;
  isReplyTarget?: boolean;
  showEmbeddings?: boolean;
  showReactions?: boolean;
  relay?: string[];
}> = (props) => {
  const text = useShortTextByID(
    () => props.id,
    () => props.relay,
  );
  const profile = useProfile(() => text().data?.parsed.pubkey);
  const openUserColumn = useOpenUserColumn();

  const replyTarget = createMemo(
    () => text().data?.parsed.tags.filter((tag) => tag.kind === "p") ?? [],
  );

  // TODO: 別ファイルに切り出す?
  const replyOrRoot = createMemo(() => {
    const reply = text().data?.parsed.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "reply",
    );
    const root = text().data?.parsed.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "root",
    );
    return reply ?? root;
  });

  const parsedContents = createMemo(() => {
    const _data = text().data;
    return _data
      ? parseTextContent(_data.parsed.content, _data.parsed.tags)
      : [];
  });

  const textType = () => {
    // e tagがあればreply
    if (replyOrRoot()) return "reply";
    // p tagのみがあればmention
    if (replyTarget().length > 0) return "mention";
    return "normal";
  };

  const reposts = useRepostsOfEvent(() => text().data?.parsed.id);

  const { sendReaction } = useSendReaction();
  const handleReaction = async (e: Emoji) => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    const _pubkey = text().data?.parsed.pubkey;
    if (!_pubkey) return;

    if (!e.native && !e.src) {
      console.error("emoji src is not found");
      return;
    }

    await sendReaction({
      targetEventId: props.id,
      targetEventPubkey: _pubkey,
      content:
        e.native !== undefined
          ? {
              type: "string",
              value: e.native,
            }
          : {
              type: "emoji",
              value: e.name,
              src: e.src,
            },
      kind: 1,
    });
  };

  return (
    <Show
      when={text().data}
      fallback={
        <PlaceholderText
          id={props.id}
          pubkey={text().data?.parsed.pubkey}
          showActions={props.showActions}
          showReply={props.showReply}
          small={props.small}
          isReplyTarget={props.isReplyTarget}
        />
      }
    >
      <div
        classList={{
          "text-4": !props.small,
          "text-3.5": props.small,
        }}
      >
        <Show when={textType() === "reply" && props.showReply}>
          <Show
            when={!props.isReplyTarget}
            fallback={
              <div class="b-l-2 b-dashed ml-[calc(0.75rem-1px)] py-1 pl-2 text-zinc-5">
                load more
              </div>
            }
          >
            {/* biome-ignore lint/style/noNonNullAssertion: textType() === "reply" */}
            <Reply id={replyOrRoot()!.id} />
            <div class="b-l-2 ml-[calc(0.75rem-1px)] h-4" />
          </Show>
        </Show>
        <HoverCard>
          <div
            class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
            style={{
              "grid-template-areas": `
            "avatar name"
            "avatar content"
            `,
            }}
          >
            <div class="grid-area-[avatar] grid grid-rows-[auto_minmax(0,1fr)]">
              <HoverCard.Trigger
                class="sticky top-2 cursor-pointer appearance-none bg-transparent"
                as="button"
                onClick={() => {
                  // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                  openUserColumn(text().data!.parsed.pubkey);
                }}
              >
                <Image
                  class="inline-flex aspect-square h-auto select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
                  classList={{
                    "w-10": !props.small,
                    "w-6": props.small,
                  }}
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
                      text().data?.parsed.pubkey.slice(0, 2)}
                  </Image.Fallback>
                </Image>
              </HoverCard.Trigger>
              <Show when={props.isReplyTarget}>
                <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
              </Show>
            </div>
            <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
              <HoverCard.Trigger
                class="w-fit max-w-full cursor-pointer appearance-none truncate bg-transparent hover:underline"
                as="button"
                onClick={() => {
                  // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                  openUserColumn(text().data!.parsed.pubkey);
                }}
              >
                <Show
                  when={profile().data}
                  fallback={text().data?.parsed.pubkey}
                >
                  <span class="font-500">
                    {profile().data?.parsed.display_name}
                  </span>
                  <span class="text-3.5 text-zinc-5">
                    @{profile().data?.parsed.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
              <span
                class="text-3.5 text-zinc-5"
                // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                title={dateHuman(new Date(text().data!.raw.created_at * 1000))}
              >
                {/* biome-ignore lint/style/noNonNullAssertion: when={text().data} */}
                {dateTimeHuman(new Date(text().data!.raw.created_at * 1000))}
              </span>
            </div>
            <div class="grid-area-[content] flex flex-col gap-2">
              <div>
                <Show when={textType() === "mention" || textType() === "reply"}>
                  <div class="text-3">
                    <For each={replyTarget()}>
                      {/* TODO: ユーザーページへのリンクにする */}
                      {(target, i) => (
                        <>
                          <Show when={i() !== 0}>
                            <span>, </span>
                          </Show>
                          <EmbedUser
                            pubkey={target.pubkey}
                            relay={target.relay}
                          />
                        </>
                      )}
                    </For>
                  </div>
                </Show>
                <ShortTextContent
                  contents={parsedContents()}
                  showLinkEmbeds={props.showEmbeddings}
                  showQuoteEmbeds={props.showEmbeddings}
                />
              </div>
              <Show when={props.showReactions}>
                <Reactions
                  // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                  eventId={text().data!.parsed.id}
                  // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                  eventPubkey={text().data!.parsed.pubkey}
                />
              </Show>
              <Show when={props.showActions}>
                <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
                  <button
                    class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                    type="button"
                  >
                    <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
                  </button>
                  <button
                    class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                    type="button"
                  >
                    <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
                    <span>{reposts().data?.length || ""}</span>
                  </button>
                  <Popover>
                    <Popover.Trigger class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5">
                      <div class="i-material-symbols:add-rounded aspect-square h-4 w-auto" />
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content class="transform-origin-[var(--kb-popover-content-transform-origin)] z-50 outline-none">
                        <EmojiPicker
                          onSelect={(v) => {
                            handleReaction(v);
                          }}
                        />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover>
                  <button
                    class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                    type="button"
                  >
                    <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
                  </button>
                  <button
                    class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                    type="button"
                  >
                    <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
                  </button>
                </div>
              </Show>
            </div>
          </div>
          <HoverCard.Portal>
            <ProfileHoverContent pubkey={text().data?.parsed.pubkey} />
          </HoverCard.Portal>
        </HoverCard>
      </div>
    </Show>
  );
};

export default Text;
