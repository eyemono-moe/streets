import { HoverCard } from "@kobalte/core/hover-card";
import { type JSX, type ParentComponent, Show, mergeProps } from "solid-js";
import { useOpenUserColumn } from "../../features/Column/libs/useOpenColumn";
import ReactionButtons from "../../features/Event/Reaction/components/ReactionButtons";
import Avatar from "../../features/User/components/Avatar";
import ProfileHoverContent from "../../features/User/components/ProfileHoverContent";
import { dateHuman, dateTimeHuman, hex2bech32 } from "../libs/format";
import type { ParsedEventPacket } from "../libs/parser";
import { useProfile } from "../libs/query";
import EventActions from "./EventActions";
import EventMenuButton from "./EventMenuButton";

const EventBase: ParentComponent<{
  eventPacket: ParsedEventPacket;
  small?: boolean;
  showReactions?: boolean;
  showActions?: boolean;
  hasParent?: boolean;
  hasChild?: boolean;
  onSelected?: () => void;
}> = (props) => {
  const mergedProps = mergeProps({ small: false }, props);

  const profile = useProfile(() => mergedProps.eventPacket.raw.pubkey);
  const userName = () =>
    `@${profile().data?.parsed.name || hex2bech32(props.eventPacket.raw.pubkey, "npub").slice(0, 12)}`;

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
          {mergedProps.children}
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
