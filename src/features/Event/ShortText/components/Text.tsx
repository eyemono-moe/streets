import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { HoverCard } from "@kobalte/core/hover-card";
import { Popover } from "@kobalte/core/popover";
import { type Component, For, Show, createMemo } from "solid-js";
import { useI18n } from "../../../../i18n";
import EmojiPicker, {
  type Emoji,
} from "../../../../shared/components/EmojiPicker";
import RichContent from "../../../../shared/components/RichContents";
import {
  dateHuman,
  dateTimeHuman,
  hex2bech32,
} from "../../../../shared/libs/format";
import { showLoginModal } from "../../../../shared/libs/nostrLogin";
import { parseTextContent } from "../../../../shared/libs/parseTextContent";
import type { EventTag } from "../../../../shared/libs/parser/commonTag";
import {
  useProfile,
  useRepostsOfEvent,
  useSendReaction,
  useSendRepost,
  useShortTextByID,
} from "../../../../shared/libs/query";
import { isLogged, useMyPubkey } from "../../../../shared/libs/useMyPubkey";
import { useOpenUserColumn } from "../../../Column/libs/useOpenColumn";
import Avatar from "../../../User/components/Avatar";
import EmbedUser from "../../../User/components/EmbedUser";
import ProfileHoverContent from "../../../User/components/ProfileHoverContent";
import ReactionButtons from "../../Reaction/components/ReactionButtons";
import PlaceholderText from "./PlaceholderText";
import Reply from "./Reply";

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
  const t = useI18n();

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

  const myPubkey = useMyPubkey();
  const reposts = useRepostsOfEvent(() => text().data?.parsed.id);
  const isReposted = createMemo(() =>
    reposts().data?.some((r) => r.parsed.pubkey === myPubkey()),
  );

  const { sendRepost, sendState: repostSendState } = useSendRepost();
  const handleRepost = () => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (isReposted()) {
      // TODO: delete repost
      return;
    }

    const repostData = text().data?.raw;
    if (!repostData) return;

    sendRepost({ targetEvent: repostData });
  };

  // TODO: Reactionsとの共通化
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
              type: "text",
              content: e.native,
            }
          : {
              type: "emoji",
              name: e.name,
              url: e.src,
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
            <div
              class="sticky top-2"
              classList={{
                "w-10": !props.small,
                "w-6": props.small,
              }}
            >
              <Avatar pubkey={text().data?.parsed.pubkey} />
            </div>
            <Show when={props.isReplyTarget}>
              <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
            </Show>
          </div>
          <div class="grid-area-[name] grid grid-cols-[minmax(0,1fr)_auto]">
            <HoverCard>
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
                  fallback={hex2bech32(
                    // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                    text().data!.parsed.pubkey,
                    "npub",
                  ).slice(0, 12)}
                >
                  <span class="font-500">
                    {profile().data?.parsed.display_name}
                  </span>
                  <span class="text-3.5 text-zinc-5">
                    @{profile().data?.parsed.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <ProfileHoverContent pubkey={text().data?.parsed.pubkey} />
              </HoverCard.Portal>
            </HoverCard>
            <span
              class="text-3.5 text-zinc-5"
              // biome-ignore lint/style/noNonNullAssertion: when={text().data}
              title={dateHuman(new Date(text().data!.raw.created_at * 1000))}
            >
              {/* biome-ignore lint/style/noNonNullAssertion: when={text().data} */}
              {dateTimeHuman(new Date(text().data!.raw.created_at * 1000))}
            </span>
          </div>
          <div class="grid-area-[content] flex flex-col gap-1">
            <div>
              <Show when={textType() === "mention" || textType() === "reply"}>
                <div class="text-3">
                  <For each={replyTarget()}>
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
              <RichContent
                contents={parsedContents()}
                showLinkEmbeds={props.showEmbeddings}
                showQuoteEmbeds={props.showEmbeddings}
              />
            </div>
            <Show when={props.showReactions}>
              <ReactionButtons
                // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                eventId={text().data!.parsed.id}
                // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                eventPubkey={text().data!.parsed.pubkey}
                // biome-ignore lint/style/noNonNullAssertion: when={text().data}
                eventKind={text().data!.parsed.kind}
              />
            </Show>
            <Show when={props.showActions}>
              <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
                <button
                  class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50"
                  type="button"
                >
                  <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <DropdownMenu>
                  <DropdownMenu.Trigger
                    class="hover:c-green-5 data-[expanded]:c-green-5 disabled:op-50 flex inline-flex appearance-none items-center items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-green-2/50 data-[expanded]:bg-green-2/50"
                    disabled={!text().data?.raw || repostSendState.sending}
                    classList={{
                      "c-green-5": isReposted(),
                    }}
                  >
                    <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
                    <Show when={reposts().data?.length}>
                      <span class="lh-4 text-3">{reposts().data?.length}</span>
                    </Show>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] c-zinc-8 rounded-2 bg-white p-1 shadow outline-none">
                      <DropdownMenu.Item
                        // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
                        class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
                        onSelect={handleRepost}
                        disabled={isReposted()}
                      >
                        <div class="i-material-symbols:repeat-rounded aspect-square h-0.75lh w-auto" />
                        {t("event.repost")}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
                        class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
                      >
                        <div class="i-material-symbols:edit-outline-rounded aspect-square h-0.75lh w-auto" />

                        {t("event.quote")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
                <Popover>
                  <Popover.Trigger class="hover:c-purple-8 data-[expanded]:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-2/50 data-[expanded]:bg-purple-2/50">
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
                  class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50"
                  type="button"
                >
                  <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50"
                  type="button"
                >
                  <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
                </button>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default Text;
