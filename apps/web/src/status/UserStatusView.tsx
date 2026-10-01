import {
  buildThreadColumn,
  buildUserColumn,
} from "@streets/core/deck/column-presets";
import { columnForAddress } from "@streets/core/deck/open-event";
import { parseEventAddress } from "@streets/core/nostr/address";
import { parseContent } from "@streets/core/nostr/content";
import type { UserStatus } from "@streets/core/nostr/user-status";
import { type Component, For, Match, Show, Switch } from "solid-js";
import { ContentTokens } from "../note/NoteText";
import { useDispatch } from "../ui-events";

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

/** プロフィールと名刺に出す。1 つずつ、折り返して全部読めるように。 */
export const UserStatusPills: Component<{ statuses: readonly UserStatus[] }> = (
  props,
) => (
  <Show when={props.statuses.length > 0}>
    <div class="flex flex-col items-start gap-1">
      <For each={props.statuses}>
        {(status) => (
          <div class="flex min-w-0 max-w-full items-start gap-1.5 rounded-3.5 bg-secondary py-1 pr-2.5 pl-2 text-caption">
            <span
              class={`${ICON[status.type].icon} c-accent-5 mt-0.5 size-4 shrink-0`}
              role="img"
              aria-label={ICON[status.type].label}
            />
            <span class="c-primary min-w-0 break-words">
              <StatusText status={status} />
            </span>
            <StatusLink status={status} />
          </div>
        )}
      </For>
    </div>
  </Show>
);

/**
 * 投稿のアイコンの右下に付ける印。中身はアイコンに触れたときの名刺で読む ——
 * 本文の上に 1 行足すと、ステータスのある人の投稿だけ高くなって煩わしい。
 * 曲と状態の両方があるときは、いま流れている曲を優先する。
 */
export const UserStatusBadge: Component<{ statuses: readonly UserStatus[] }> = (
  props,
) => {
  const shown = () =>
    props.statuses.find((status) => status.type === "music") ??
    props.statuses[0];
  return (
    <Show when={shown()}>
      {(status) => (
        // 触れたときはアイコンの名刺が開くよう、印そのものは触れられないようにする。
        <span
          class="-right-1 -bottom-1 pointer-events-none absolute grid size-4.5 place-items-center rounded-full bg-accent-5 ring-2 ring-white dark:ring-ui-950"
          role="img"
          aria-label={`${ICON[status().type].label}：${status().content}`}
        >
          <span
            class={`${ICON[status().type].icon} c-white size-3`}
            aria-hidden="true"
          />
        </span>
      )}
    </Show>
  );
};
