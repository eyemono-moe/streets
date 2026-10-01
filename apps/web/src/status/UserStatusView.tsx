import {
  buildThreadColumn,
  buildUserColumn,
} from "@streets/core/deck/column-presets";
import { columnForAddress } from "@streets/core/deck/open-event";
import { parseEventAddress } from "@streets/core/nostr/address";
import { parseContent } from "@streets/core/nostr/content";
import type { UserStatus } from "@streets/core/nostr/user-status";
import { type Component, Match, Show, Switch } from "solid-js";
import { ContentTokens } from "../note/NoteText";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";

const ICON: Record<UserStatus["type"], { icon: string; label: string }> = {
  general: {
    icon: "i-material-symbols:chat-bubble-outline-rounded",
    label: "ステータス",
  },
  music: {
    icon: "i-material-symbols:music-note-rounded",
    label: "聴いている曲",
  },
};

const StatusText: Component<{ status: UserStatus; interactive?: boolean }> = (
  props,
) => (
  <ContentTokens
    tokens={parseContent(props.status.content, props.status.tags as string[][])}
    emojiClass="h-[1.2em]"
    interactive={props.interactive}
  />
);

/** ステータスから開ける先。URL は新しいタブ、投稿や人はカラムで開く。 */
const StatusLink: Component<{ status: UserStatus }> = (props) => {
  const dispatch = useDispatch();
  const column = () => {
    const link = props.status.link;
    if (!link) return undefined;
    switch (link.type) {
      case "event":
        return buildThreadColumn(link.id);
      case "profile":
        return buildUserColumn(link.pubkey);
      case "address": {
        const address = parseEventAddress(link.address);
        return address ? columnForAddress(address) : undefined;
      }
      default:
        return undefined;
    }
  };
  return (
    <Switch>
      <Match when={props.status.link?.type === "url" && props.status.link}>
        {(link) => (
          <a
            href={(link() as { url: string }).url}
            target="_blank"
            rel="noopener noreferrer"
            class="c-secondary hover:c-primary i-material-symbols:open-in-new-rounded size-3.5 shrink-0"
            aria-label="ステータスのリンクを開く"
            title={(link() as { url: string }).url}
          />
        )}
      </Match>
      <Match when={column()}>
        {(column) => (
          <button
            type="button"
            class="c-secondary hover:c-primary flex shrink-0 cursor-pointer bg-transparent p-0"
            aria-label="ステータスの指す先を開く"
            onClick={() => dispatch({ type: "stack/open", column: column() })}
          >
            <span
              class="i-material-symbols:chevron-right-rounded size-4"
              aria-hidden="true"
            />
          </button>
        )}
      </Match>
    </Switch>
  );
};

/**
 * いまの状態（general）を、アイコンから出る吹き出しにする。アイコンの下の段に
 * 幅いっぱいで置くので、長い文でも折り返して全部読める。`arrowLeft` は、
 * 三角をアイコンの真下に合わせるための、吹き出しの左端からの距離（px）。
 */
export const UserStatusBubble: Component<{
  statuses: readonly UserStatus[];
  arrowLeft: number;
  /**
   * 上の余白。アイコンの下端に少し重ねて、アイコンから出ている形にする。
   * 並べる側の行間に合わせて、置き場所ごとに渡す。
   */
  class: string;
  /** 自分のプロフィールで、直す操作を出す。 */
  onEdit?: () => void;
}> = (props) => (
  <Show when={props.statuses.find((status) => status.type === "general")}>
    {(status) => (
      // 中身に合わせた幅にし、長い文だけ幅いっぱいまで広げて折り返す。
      // 三角がはみ出さないよう、三角の位置より狭くはしない。
      <div
        class={`relative w-fit max-w-full rounded-2.5 bg-secondary px-2.5 py-1 text-[12px] leading-normal ${props.class}`}
        style={{ "min-width": `${props.arrowLeft + 24}px` }}
      >
        <span
          // 長めの三角にして、本体をボタンから離したまま先をアイコンに届かせる。
          class="-top-2.5 absolute h-2.5 w-3 bg-secondary"
          style={{
            left: `${props.arrowLeft}px`,
            "clip-path": "polygon(50% 0, 100% 100%, 0 100%)",
          }}
          aria-hidden="true"
        />
        <p class="c-primary relative flex items-center gap-1.5 break-words">
          <span class="sr-only">{ICON.general.label}：</span>
          <span class="min-w-0 flex-1">
            <StatusText status={status()} />
          </span>
          <StatusLink status={status()} />
          <Show when={props.onEdit}>
            {(edit) => (
              <IconButton
                icon="i-material-symbols:edit-outline-rounded"
                label="ステータスを直す"
                size="sm"
                onClick={() => edit()()}
              />
            )}
          </Show>
        </p>
      </div>
    )}
  </Show>
);

/** 聴いている曲（music）。名前の下に 1 行で添える。 */
export const UserNowPlaying: Component<{ statuses: readonly UserStatus[] }> = (
  props,
) => (
  <Show when={props.statuses.find((status) => status.type === "music")}>
    {(status) => (
      <p class="c-secondary flex min-w-0 items-start gap-1.5 text-caption">
        <span
          class={`${ICON.music.icon} c-accent-5 mt-0.5 size-4 shrink-0`}
          role="img"
          aria-label={ICON.music.label}
        />
        <span class="min-w-0 break-words">
          <StatusText status={status()} />
        </span>
        <StatusLink status={status()} />
      </p>
    )}
  </Show>
);
