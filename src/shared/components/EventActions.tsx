import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Popover } from "@kobalte/core/popover";
import { neventEncode } from "nostr-tools/nip19";
import { type Component, Show, createMemo } from "solid-js";
import { usePostInput } from "../../features/CreatePost/context/postInputDialog";
import { useI18n } from "../../i18n";
import { copyToClipboard } from "../libs/clipboard";
import { showLoginModal } from "../libs/nostrLogin";
import type { ParsedEventPacket } from "../libs/parser";
import type { EventTag } from "../libs/parser/commonTag";
import {
  useRepostsOfEvent,
  useSendReaction,
  useSendRepost,
} from "../libs/query";
import { isLogged, useMyPubkey } from "../libs/useMyPubkey";
import EmojiPicker, { type Emoji } from "./EmojiPicker";

const EventActions: Component<{
  event: ParsedEventPacket;
}> = (props) => {
  const t = useI18n();

  const openPostInput = usePostInput();
  const handleReply = () => {
    if (props.event.parsed.kind !== 1) return;

    const textData = props.event.parsed;
    if (!textData) return;

    // reply先にroot tagがあるならそれをrootにし, replyタグにこのポストのidを入れる
    // root tagがないならrootタグにこのポストのidを入れる
    const root = textData.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "root",
    );

    const mentions = textData.tags
      .filter((tag) => tag.kind === "p")
      .map((tag) => tag.pubkey);
    mentions.push(textData.pubkey);

    openPostInput({
      text: "",
      reply: root
        ? {
            rootId: root.id,
            replyId: textData.id,
          }
        : {
            rootId: textData.id,
          },
      mention: mentions,
    });
  };

  const myPubkey = useMyPubkey();
  const reposts = useRepostsOfEvent(() => props.event.raw.id);
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

    sendRepost({ targetEvent: props.event.raw, relay: props.event.from });
  };

  const handleQuote = () => {
    openPostInput({
      text: `

${neventEncode({
  id: props.event.raw.id,
  kind: props.event.raw.kind,
  author: props.event.raw.pubkey,
  relays: [props.event.from],
})}`,
    });
  };

  const { sendReaction } = useSendReaction();
  const handleReaction = async (e: Emoji) => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (!e.native && !e.src) {
      console.error("emoji src is not found");
      return;
    }

    await sendReaction({
      targetEventId: props.event.raw.id,
      targetEventPubkey: props.event.raw.pubkey,
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
      kind: props.event.raw.kind,
    });
  };

  const handleCopyEventID = () => {
    copyToClipboard(
      neventEncode({
        id: props.event.raw.id,
        kind: props.event.raw.kind,
        relays: [props.event.from],
        author: props.event.raw.pubkey,
      }),
    );
  };

  return (
    <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
      <button
        class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50"
        type="button"
        onClick={handleReply}
      >
        <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
      </button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          class="hover:c-green-5 data-[expanded]:c-green-5 disabled:op-50 flex inline-flex appearance-none items-center items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-green-2/50 data-[expanded]:bg-green-2/50"
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
              disabled={isReposted() || repostSendState.sending}
            >
              <div class="i-material-symbols:repeat-rounded aspect-square h-0.75lh w-auto" />
              {t("event.repost")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
              onSelect={handleQuote}
            >
              <div class="i-material-symbols:edit-outline-rounded aspect-square h-0.75lh w-auto" />

              {t("event.quote")}
            </DropdownMenu.Item>
            {/* TODO: リポストしたユーザーの一覧/引用リポストを別カラムで開く */}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
      <Popover>
        <Popover.Trigger class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50">
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
      <DropdownMenu>
        <DropdownMenu.Trigger class="hover:c-purple-8 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-purple-3/50">
          <div class="i-material-symbols:upload-rounded aspect-square h-4 w-auto" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] c-zinc-8 rounded-2 bg-white p-1 shadow outline-none">
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-zinc-2/50"
              onSelect={handleCopyEventID}
            >
              <div class="aspect-square h-0.75lh w-auto i-material-symbols:content-copy-outline-rounded" />
              {t("event.copyEventID")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  );
};

export default EventActions;
