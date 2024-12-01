import { HoverCard } from "@kobalte/core/hover-card";
import { createElementSize } from "@solid-primitives/resize-observer";
import {
  type JSX,
  type ParentComponent,
  Show,
  createSignal,
  mergeProps,
} from "solid-js";
import { useOpenUserColumn } from "../../features/Column/libs/useOpenColumn";
import ReactionButtons from "../../features/Event/Reaction/components/ReactionButtons";
import Avatar from "../../features/User/components/Avatar";
import ProfileHoverContent from "../../features/User/components/ProfileHoverContent";
import { useI18n } from "../../i18n";
import { dateHuman, dateTimeHuman, hex2bech32 } from "../libs/format";
import type { ParsedEventPacket } from "../libs/parser";
import { useProfile } from "../libs/query";
import EventActions from "./EventActions";
import EventMenuButton from "./EventMenuButton";

const MAX_CONTENT_HEIGHT = 400;

const EventBase: ParentComponent<{
  eventPacket: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  hasParent?: boolean;
  hasChild?: boolean;
  onSelected?: () => void;
  defaultExpanded?: boolean;
}> = (props) => {
  const t = useI18n();

  const mergedProps = mergeProps({ small: false }, props);

  const profile = useProfile(() => mergedProps.eventPacket.raw.pubkey);
  const userName = () =>
    `@${
      profile().data?.parsed.name ||
      hex2bech32(props.eventPacket.raw.pubkey, "npub").slice(0, 12)
    }`;

  const openUserColumn = useOpenUserColumn();

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

    // テキスト選択時は何もしない
    if (window.getSelection()?.toString()) return;

    props.onSelected?.();
  };

  const [contentWrapper, setContentWrapper] = createSignal<HTMLDivElement>();
  const contentSize = createElementSize(contentWrapper);
  // ユーザーがコンテンツを展開したかどうか
  const [isExpanded, setIsExpanded] = createSignal(
    props.defaultExpanded || false,
  );
  // コンテンツが最大の高さを超えているかどうか
  const isOverflown = () =>
    contentSize.height && contentSize.height >= MAX_CONTENT_HEIGHT;

  return (
    <button
      onClick={handleOnClick}
      type="button"
      // ネストしたイベント(リポスト内容, リアクション内容, リプライ先等)ではpaddingを削除する
      // 引用表示ではpaddingを1にする
      class="group/event w-full select-text appearance-none bg-transparent p-2 text-align-unset group-[_]/event:p-0 group-[_]/quote:p-1"
      classList={{
        "text-body": !mergedProps.small,
        "text-caption": mergedProps.small,
        "pt-0!": mergedProps.hasParent,
        "pb-0!": mergedProps.hasChild,
      }}
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
        style={{
          "grid-template-areas": `
            "avatar name"
            "avatar content"
            `,
        }}
      >
        <div class="grid-area-[avatar] relative grid grid-rows-[auto_minmax(0,1fr)]">
          <div
            class="sticky top-0"
            classList={{
              "w-10": !mergedProps.small,
              "w-6": mergedProps.small,
            }}
          >
            <Avatar pubkey={mergedProps.eventPacket.raw.pubkey} />
          </div>
          <Show when={mergedProps.hasChild}>
            <div class="b-l-2 ml-[calc(0.75rem-1px)]" />
          </Show>
        </div>
        <div class="grid-area-[name] flex justify-between gap-2">
          <div class="flex w-full items-baseline gap-1 overflow-hidden">
            {/* TODO: EmbedUserを使う */}
            <HoverCard>
              <HoverCard.Trigger
                class="w-fit max-w-full cursor-pointer appearance-none truncate bg-transparent hover:underline"
                as="button"
                onClick={() => {
                  openUserColumn(mergedProps.eventPacket.raw.pubkey);
                }}
              >
                <Show
                  when={profile().data}
                  fallback={mergedProps.eventPacket.raw.pubkey}
                >
                  <span class="font-500">
                    {profile().data?.parsed.display_name}
                  </span>
                  <span class="c-secondary text-caption">
                    @{profile().data?.parsed.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <ProfileHoverContent
                  pubkey={mergedProps.eventPacket.raw.pubkey}
                />
              </HoverCard.Portal>
            </HoverCard>
            <span
              class="c-secondary text-nowrap text-caption"
              title={dateHuman(
                new Date(mergedProps.eventPacket.raw.created_at * 1000),
              )}
            >
              {dateTimeHuman(
                new Date(mergedProps.eventPacket.raw.created_at * 1000),
              )}
            </span>
          </div>
          <EventMenuButton
            event={mergedProps.eventPacket}
            userName={userName()}
          />
        </div>
        <div
          class="grid-area-[content] flex flex-col gap-1"
          classList={{
            "pb-2": mergedProps.hasChild,
          }}
        >
          <div class="relative">
            <div
              ref={setContentWrapper}
              class="overflow-hidden"
              style={{
                "max-height": isExpanded() ? "none" : `${MAX_CONTENT_HEIGHT}px`,
              }}
            >
              {mergedProps.children}
            </div>
            <Show when={isOverflown() && !isExpanded()}>
              <button
                class="parent absolute bottom-0 flex w-full cursor-s-resize appearance-none justify-center bg-gradient-to-b bg-transparent from-transparent to-white pt-4 text-caption dark:to-ui-950"
                type="button"
                onClick={() => setIsExpanded(true)}
              >
                <div class="flex items-center gap-1 rounded bg-tertiary px-2 py-0.5">
                  <div class="i-material-symbols:expand-more-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
                  <div class="text-caption">{t("event.showMore")}</div>
                </div>
              </button>
            </Show>
          </div>
          <Show when={mergedProps.showReactions}>
            <ReactionButtons
              eventId={mergedProps.eventPacket.raw.id}
              eventPubkey={mergedProps.eventPacket.raw.pubkey}
              eventKind={mergedProps.eventPacket.raw.kind}
            />
          </Show>
          <Show when={mergedProps.showActions}>
            <EventActions event={mergedProps.eventPacket} />
          </Show>
        </div>
      </div>
    </button>
  );
};

export default EventBase;
