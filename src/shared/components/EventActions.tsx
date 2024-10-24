import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Popover } from "@kobalte/core/popover";
import { neventEncode } from "nostr-tools/nip19";
import { type Component, Show, createMemo } from "solid-js";
import { useMe } from "../../context/me";
import { usePostInput } from "../../features/CreatePost/context/postInputDialog";
import { useI18n } from "../../i18n";
import { copyToClipboard } from "../libs/clipboard";
import { showLoginModal } from "../libs/nostrLogin";
import type { ParsedEventPacket } from "../libs/parser";
import type { EventTag } from "../libs/parser/commonTag";
import {
  useRepliesOfEvent,
  useRepostsOfEvent,
  useSendReaction,
  useSendRepost,
} from "../libs/query";
import EmojiPicker, { type Emoji } from "./EmojiPicker";

const EventActions: Component<{
  event: ParsedEventPacket;
}> = (props) => {
  const t = useI18n();

  const openPostInput = usePostInput();
  const replies = useRepliesOfEvent(() => props.event.raw.id);
  const replyCount = createMemo(
    () =>
      replies().data?.filter(
        (r) => r.parsed.replyOrRoot?.id === props.event.raw.id,
      ).length,
  );

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

  const [{ myPubkey, isLogged }] = useMe();
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
    <div class="c-secondary flex w-full max-w-100 items-center justify-between">
      <button
        class="hover:c-accent-5 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-accent-5/25"
        type="button"
        onClick={handleReply}
      >
        <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
        <Show when={replyCount()}>
          <span class="lh-4 text-caption">{replyCount()}</span>
        </Show>
      </button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          class="hover:c-green-5 data-[expanded]:c-green-5 disabled:op-50 inline-flex appearance-none items-center gap-1 rounded-full bg-transparent p-1 hover:bg-green-5/25 data-[expanded]:bg-green-5/25"
          classList={{
            "c-green-5": isReposted(),
          }}
        >
          <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
          <Show when={reposts().data?.length}>
            <span class="lh-4 text-caption">{reposts().data?.length}</span>
          </Show>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] rounded-2 bg-primary p-1 shadow-lg shadow-ui/25 outline-none">
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
              onSelect={handleRepost}
              disabled={isReposted() || repostSendState.sending}
            >
              <div class="i-material-symbols:repeat-rounded aspect-square h-0.75lh w-auto" />
              {t("event.repost")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
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
        <Popover.Trigger class="hover:c-accent-5 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-accent-5/25">
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
        class="hover:c-accent-5 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-accent-5/25"
        type="button"
      >
        <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
      </button>
      <DropdownMenu>
        <DropdownMenu.Trigger class="hover:c-accent-5 flex appearance-none items-center gap-1 rounded rounded-full bg-transparent p-1 hover:bg-accent-5/25">
          <div class="i-material-symbols:upload-rounded aspect-square h-4 w-auto" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="b-1 transform-origin-[--kb-menu-content-transform-origin] rounded-2 bg-primary p-1 shadow-lg shadow-ui/25 outline-none">
            <DropdownMenu.Item
              // biome-ignore lint/nursery/useSortedClasses: sort with paren not supported
              class="data-[disabled]:(op-50 pointer-events-none cursor-default) flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none data-[highlighted]:bg-alpha-hover"
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
