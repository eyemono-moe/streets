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
import IconButton from "../ui/IconButton";
import Marquee from "../ui/Marquee";
import { useUserStatuses } from "./use-user-statuses";

const LABEL: Record<UserStatus["type"], string> = {
  general: "ステータス",
  music: "聴いている曲",
};

/** 音の波の 3 本の棒（x と高さ）。下端をそろえ、幅 6.5・高さ 6 に収まる。 */
const WAVE_BARS = [
  { x: 0, height: 3 },
  { x: 2.5, height: 6 },
  { x: 5, height: 4 },
] as const;

/**
 * 聴いている曲の印の棒。`animate` なら棒ごとに始まりをずらして揺らす。
 * (x, y) は棒の並びの左上。
 */
const WaveBars: Component<{ x: number; y: number; animate?: boolean }> = (
  props,
) => (
  <For each={WAVE_BARS}>
    {(bar, index) => (
      <rect
        x={props.x + bar.x}
        y={props.y + 6 - bar.height}
        width={1.5}
        height={bar.height}
        rx={0.75}
        class="origin-bottom [transform-box:fill-box]"
        classList={{ "animate-status-wave": props.animate }}
        style={
          props.animate ? { "animation-delay": `${index() * -400}ms` } : {}
        }
      />
    )}
  </For>
);

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
 * いまの状態（general）と聴いている曲（music）を、アイコンから出る 1 つの吹き出しに
 * まとめる。どちらか片方だけでも同じ場所に出す。アイコンの下の段に幅いっぱいで置くので、
 * 長い状態の文は折り返して全部読める。曲は 1 行に収め、収まらなければ流す。
 * `arrowLeft` は、三角をアイコンの真下に合わせるための、吹き出しの左端からの距離（px）。
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
}> = (props) => {
  const general = () =>
    props.statuses.find((status) => status.type === "general");
  const music = () => props.statuses.find((status) => status.type === "music");
  return (
    <Show when={general() || music()}>
      {/* 中身に合わせた幅にし、長い文だけ幅いっぱいまで広げて折り返す。 */}
      {/* 三角がはみ出さないよう、三角の位置より狭くはしない。 */}
      <div
        class={`relative flex w-fit max-w-full flex-col rounded-2.5 bg-secondary px-2.5 py-1 text-[12px] leading-normal ${props.class}`}
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
        <Show when={general()}>
          {(status) => (
            <p class="c-primary relative flex items-center gap-1.5 break-words">
              <span class="sr-only">{LABEL.general}：</span>
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
          )}
        </Show>
        <Show when={music()}>
          {(status) => (
            <p
              class="c-primary flex min-w-0 items-center gap-1.5"
              classList={{
                "mt-1 border-ui-2 border-t pt-1 dark:border-ui-7": !!general(),
              }}
            >
              <svg
                viewBox="0 0 6.5 6"
                class="c-secondary h-2.5 w-2.75 shrink-0 fill-current"
                role="img"
                aria-label={LABEL.music}
              >
                <WaveBars x={0} y={0} />
              </svg>
              <Marquee class="flex-1">
                <StatusText status={status()} />
              </Marquee>
              <StatusLink status={status()} />
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
};

/** 印の吹き出しの高さ（px）。三角はこの上に 4px 出る。 */
const BADGE_HEIGHT = 9;
const TAIL = 4;
/** 縁の太さ（px）。縁の分だけ、吹き出しはアイコンの外へ広がって見える。 */
const RIM = 2;

/**
 * アイコンの右下に添える、ステータスと曲の印。主張しないよう灰色で小さく描き、
 * 中身は名刺に任せる。縁を背景の色で描き、アイコンとの境目を見せる。三角と吹き出しは
 * 先に縁だけをまとめて描いてから塗るので、継ぎ目に線が出ない。
 */
export const StatusBadgeView: Component<{
  general: boolean;
  music: boolean;
}> = (props) => {
  // 中身の幅：音の波 6.5、点 3 つ 11、間 2、左右の余白。
  const width = () =>
    props.general && props.music ? 27 : props.general ? 17 : 13;
  const dotsX = () => (props.music ? 12 : 3);
  // 三角はアイコンの右下の角の少し内側から出す（いただいたデザインの位置）。
  const tail = () => {
    const left = width() - 13;
    return `M ${left} ${TAIL + 1} L ${left + 1.9} 0.8 Q ${left + 2.5} -0.2 ${left + 3.1} 0.8 L ${left + 5} ${TAIL + 1} Z`;
  };
  const shapes = () => (
    <>
      <rect
        y={TAIL}
        width={width()}
        height={BADGE_HEIGHT}
        rx={BADGE_HEIGHT / 2}
      />
      <Show when={props.general}>
        <path d={tail()} />
      </Show>
    </>
  );
  return (
    <Show when={props.general || props.music}>
      <svg
        width={width() + RIM * 2}
        height={TAIL + BADGE_HEIGHT + RIM * 2}
        viewBox={`${-RIM} ${-RIM} ${width() + RIM * 2} ${TAIL + BADGE_HEIGHT + RIM * 2}`}
        class="block"
        aria-hidden="true"
      >
        <g
          class="stroke-white dark:stroke-ui-950"
          fill="none"
          stroke-width={RIM * 2}
          stroke-linejoin="round"
        >
          {shapes()}
        </g>
        <g class="fill-ui-3 dark:fill-ui-7">{shapes()}</g>
        <g class="fill-ui-5 dark:fill-ui-4">
          <Show when={props.music}>
            <WaveBars x={3} y={TAIL + 1.5} animate />
          </Show>
          <Show when={props.general}>
            <For each={[0, 4, 8]}>
              {(offset) => (
                <circle
                  cx={dotsX() + offset + 1.5}
                  cy={TAIL + BADGE_HEIGHT / 2}
                  r={1.5}
                />
              )}
            </For>
          </Show>
        </g>
      </svg>
    </Show>
  );
};

/**
 * 投稿のアイコンに添える印。並ぶ人が多いので、手元の値を使い回す。
 * アイコン（40px）の右端にそろえ、下端から 8px はみ出す位置に置く。
 */
export const UserStatusBadge: Component<{ pubkey: string }> = (props) => {
  const statuses = useUserStatuses(() => props.pubkey);
  return (
    <div class="pointer-events-none absolute -right-0.5 top-[33px]">
      <StatusBadgeView
        general={statuses().some((status) => status.type === "general")}
        music={statuses().some((status) => status.type === "music")}
      />
    </div>
  );
};
